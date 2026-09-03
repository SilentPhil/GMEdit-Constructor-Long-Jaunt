import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import * as nodePath from 'node:path';
import test from 'node:test';
import { HOST_PLATFORM } from '../../js/compiler/igor-paths.js';
import { inject } from '../../js/utils/node/node-import.js';
import { assertOk } from '../index.js';
import { MockDiskIO } from '../utils/io/MockDiskIO.js';

class FakeProcess extends EventEmitter {
	/**
	 * @param {string} command
	 * @param {string[]} args
	 */
	constructor(command, args) {
		super();
		this.spawnargs = [command, ...args];
		this.stdout = new EventEmitter();
		this.stderr = new EventEmitter();
		this.pid = FakeProcess.nextPid++;
		this.exitCode = null;

		queueMicrotask(() => this.emit('spawn'));
	}

	static nextPid = 1;
}

test.suite('CompileControllerImpl', () => {
	test('emits incremental output while retaining complete stdout', async () => {
		globalThis.$gmedit = {
			'ui.Preferences': {}
		};

		const { IgorJob } = await import('../../js/compiler/job/IgorJob.js');
		const process = new FakeProcess('igor', ['/v']);
		const job = new IgorJob(0, {}, process, {}, new Date());
		const initialStdout = job.stdout;
		const outputChunks = [];
		const stdoutSnapshots = [];

		job.events.on('output', output => outputChunks.push(output));
		job.events.on('stdout', stdout => stdoutSnapshots.push(stdout));

		process.stdout.emit('data', Buffer.from('first\r\n'));
		process.stderr.emit('data', Buffer.from('second'));

		assert.deepEqual(outputChunks, ['first\n', 'second']);
		assert.deepEqual(stdoutSnapshots, [
			initialStdout + 'first\n',
			initialStdout + 'first\nsecond'
		]);
		assert.equal(job.stdout, initialStdout + 'first\nsecond');
	});

	test('stops the matching live job when reusing an id after earlier jobs finish', async () => {
		globalThis.$gmedit = {
			'ui.Preferences': {}
		};

		const { CompileControllerImpl } = await import('../../js/compiler/CompileControllerImpl.js');
		const spawnedProcesses = [];

		inject({
			path: nodePath,
			child_process: {
				spawn(command, args) {
					const process = new FakeProcess(command, args);
					spawnedProcesses.push(process);
					return process;
				}
			}
		});

		const diskIO = new MockDiskIO({});
		const controller = new CompileControllerImpl({
			dir: 'project',
			path: diskIO.joinPath('project', 'project.yyp'),
			displayName: 'project'
		}, diskIO);

		const job0Result = await controller.start(createSettings(diskIO), 0);
		const job1Result = await controller.start(createSettings(diskIO), 1);
		assertOk(job0Result);
		assertOk(job1Result);

		const job0 = job0Result.data;
		const job1 = job1Result.data;

		job0.process.exitCode = 0;
		job0.process.emit('exit');

		let stoppedJobId;
		job1.stop = async () => {
			stoppedJobId = job1.id;
			job1.process.exitCode = 0;
			job1.process.emit('exit');
			return {
				ok: true,
				data: {
					stopType: 'Stopped',
					errors: []
				}
			};
		};

		const reusedJobResult = await controller.start(createSettings(diskIO), 1);
		assertOk(reusedJobResult);

		assert.equal(stoppedJobId, 1);
		assert.equal(reusedJobResult.data.id, 1);
		assert.equal(spawnedProcesses.length, 3);
	});

	test('re-runs the last successful Run job from the same build directory without rebuilding', async () => {
		globalThis.$gmedit = {
			'ui.Preferences': {}
		};

		const { CompileControllerImpl } = await import('../../js/compiler/CompileControllerImpl.js');
		const spawnedProcesses = [];

		inject({
			path: nodePath,
			child_process: {
				spawn(command, args) {
					const process = new FakeProcess(command, args);
					spawnedProcesses.push(process);
					return process;
				}
			}
		});

		const diskIO = new MockDiskIO({});
		const controller = new CompileControllerImpl({
			dir: 'project',
			path: diskIO.joinPath('project', 'project.yyp'),
			displayName: 'project'
		}, diskIO);

		const unavailableResult = await controller.rerunLastBuild();
		assert.equal(unavailableResult.ok, false);

		const buildResult = await controller.start(createSettings(diskIO), 3);
		assertOk(buildResult);
		buildResult.data.process.exitCode = 0;
		buildResult.data.process.emit('exit');

		const rerunResult = await controller.rerunLastBuild();
		assertOk(rerunResult);

		assert.equal(spawnedProcesses.length, 2);
		assert.equal(rerunResult.data.id, 3);
		assert.ok(spawnedProcesses[1].spawnargs.includes('/nb'));
		assert.equal(
			findFlag(spawnedProcesses[1].spawnargs, '/cache='),
			findFlag(spawnedProcesses[0].spawnargs, '/cache=')
		);
	});

	test('forgets the reusable build when project build files are cleaned', async () => {
		globalThis.$gmedit = {
			'ui.Preferences': {}
		};

		const { CompileControllerImpl } = await import('../../js/compiler/CompileControllerImpl.js');

		inject({
			path: nodePath,
			child_process: {
				spawn(command, args) {
					return new FakeProcess(command, args);
				}
			}
		});

		const diskIO = new MockDiskIO({});
		const controller = new CompileControllerImpl({
			dir: 'project',
			path: diskIO.joinPath('project', 'project.yyp'),
			displayName: 'project'
		}, diskIO);

		const buildResult = await controller.start(createSettings(diskIO));
		assertOk(buildResult);
		buildResult.data.process.exitCode = 0;
		buildResult.data.process.emit('exit');

		controller.forgetLastBuild();
		const rerunResult = await controller.rerunLastBuild();
		assert.equal(rerunResult.ok, false);
	});
});

/**
 * @param {string[]} args
 * @param {string} prefix
 */
function findFlag(args, prefix) {
	return args.find(argument => argument.startsWith(prefix));
}

/**
 * @param {DiskIO} diskIO
 * @returns {GMS2.IgorSettings}
 */
function createSettings(diskIO) {
	return {
		task: 'Run',
		user: {
			fullPath: diskIO.joinPath('users', 'user.json')
		},
		runtime: {
			path: 'runtime',
			igorPath: diskIO.joinPath('runtime', 'Igor'),
			version: {
				supportsPrefabsPath: () => false
			}
		},
		buildPath: 'build',
		platform: HOST_PLATFORM,
		runtimeType: 'VM',
		configName: 'Default'
	};
}
