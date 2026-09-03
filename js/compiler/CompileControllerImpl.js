/**
 * Container for controlling the list of compile jobs,
 * and starting new ones on projects.
 */

import { IgorJob } from './job/IgorJob.js';
import { HOST_PLATFORM, output_blob_exts } from './igor-paths.js';
import { InvalidStateErr, SolvableError } from '../utils/Err.js';
import { child_process } from '../utils/node/node-import.js';
import { Err, Ok } from '../utils/Result.js';
import { docString } from '../utils/StringUtils.js';

/**
 * Real implementation of the compile controller, spawning Igor tasks.
 * 
 * @implements {GM.CompileController}
 */
export class CompileControllerImpl {

	/**
	 * @type {IgorJob[]}
	 * @private
	 */
	jobs = [];

	/**
	 * The most recent successful Run job that can be launched again without rebuilding.
	 * Settings keep the unresolved build root so {@link start} can reconstruct the same job path.
	 *
	 * @private
	 * @type {{ settings: GMS2.IgorSettings, id: number, resolvedBuildPath: string }|undefined}
	 */
	lastSuccessfulBuild = undefined;

	/**
	 * @param {GMEdit.Project} project
	 * @param {DiskIO} diskIO 
	 */
	constructor(project, diskIO) {
		/** @private */
		this.project = project;

		/** @private */
		this.diskIO = diskIO;
	}

	async destroyAsync() {
		await this.stopAll();
		this.jobs.length = 0;
	}

	/**
	 * Run a new job on a given project.
	 * 
	 * @param {GMS2.IgorSettings} settings
	 * @param {number|undefined} [id] Specific ID to use for this job, for stealing from an existing one.
	 * @returns {Promise<Result<IgorJob>>}
	 */
	async start(settings, id = this.getNewJobId()) {
		if (settings.device === undefined && this.requiresRemoteDevice(settings.task, settings.platform)) {
			// TODO: use a union error type for passing this upwards to show the user a better message.
			// Error descriptiveness isn't as good at this level.
			return Err(new SolvableError(
				docString(`
					To build for ${settings.platform}, you need to pick a remote device to
					execute the process on. 
				`),
				docString(`
					Add a remote device in the IDE, and reload Constructor to pick it up.
				`)
			));
		}

		const reusableSettings = { ...settings };
		const idString = id.toString();
		settings = {
			...settings,
			buildPath: this.diskIO.joinPath(settings.buildPath, settings.platform, idString)
		};

		// A new build into the same directory may overwrite the previous artifacts before it
		// completes, so it is no longer safe to offer those artifacts for re-running.
		if (!settings.noBuild && this.lastSuccessfulBuild?.resolvedBuildPath === settings.buildPath) {
			this.lastSuccessfulBuild = undefined;
		}

		if (!(await this.diskIO.readDir(settings.buildPath)).ok) {
			
			const res = await this.diskIO.createDir(settings.buildPath, true);
			
			if (!res.ok) {
				return Err(new SolvableError(
					'Failed to create the build directory for project output!',
					docString(`
						Ensure the path '${settings.buildPath}' is valid, and that GMEdit would have
						permission to edit files and directories there.
					`),
					res.err
				));
			}

		}
		
		const flags = this.getFlagsForJobSettings(settings);

		const existingJobs = this.jobs.filter(job => job.id === id);
		await Promise.all(existingJobs.map(job => job.stop()));

		/** @type {import('node:child_process').SpawnOptionsWithoutStdio} */
		const spawn_opts = {
			cwd: this.project.dir,
			detached: (process.platform !== 'win32')
		};
		
		/** @type {import('node:child_process').ChildProcessWithoutNullStreams} */
		let proc;
		/** @type {Date} */
		let startTime;

		try {
			proc = child_process.spawn(settings.runtime.igorPath, flags, spawn_opts);
			
			startTime = await new Promise((resolve, reject) => {
				proc.once('spawn', () => resolve(new Date()));
				proc.once('error', reject);
			});
		} catch (err) {
			return Err(new InvalidStateErr('While trying to create the Igor process, the spawn() call failed unexpectedly', err));
		}
		
		const job = new IgorJob(id, settings, proc, this.project, startTime);
		
		this.jobs.push(job);
		job.events.once('stop', ({ stopType }) => {
			this.removeJob(job);

			if (!settings.noBuild && settings.task === 'Run' && stopType === 'Finished') {
				this.lastSuccessfulBuild = {
					settings: reusableSettings,
					id,
					resolvedBuildPath: settings.buildPath
				};
			}
		});

		return Ok(job);
	}

	/**
	 * Launch the last successfully built Run job without compiling it again.
	 *
	 * @returns {Promise<Result<IgorJob>>}
	 */
	async rerunLastBuild() {
		if (this.lastSuccessfulBuild === undefined) {
			return Err(new SolvableError(
				'There is no successful project build available to re-run.',
				'Run the project successfully once, then use Re-Run Last Build.'
			));
		}

		const { settings, id } = this.lastSuccessfulBuild;

		if (settings.runtime.version.supportsNoBuild?.() === false) {
			return Err(new SolvableError(
				`Runtime ${settings.runtime.version} does not support re-running a build.`,
				'Build the project with a GameMaker 2024.11 or newer runtime.'
			));
		}

		return this.start({ ...settings, noBuild: true }, id);
	}

	/**
	 * Forget the previously built project, for example after its build directory is cleaned.
	 */
	forgetLastBuild() {
		this.lastSuccessfulBuild = undefined;
	}

	/**
	 * Stop all currently running jobs.
	 * 
	 * @returns {Promise<void>} Promise that resolves when all jobs have stopped.
	 */
	async stopAll() {
		await Promise.all(this.jobs.map(job => job.stop()));
	}

	/**
	 * Select the flags for Igor to run the job.
	 * 
	 * @private
	 * @param {GMS2.IgorSettings} settings
	 * @returns {string[]}
	 */
	getFlagsForJobSettings(settings) {

		const projectName = this.project.displayName;
		const blob_extension = output_blob_exts[settings.platform];

		const flags = [
			'/project=' + this.project.path,
			'/config=' + settings.configName,
			'/rp=' + settings.runtime.path,
			'/runtime=' + settings.runtimeType,
			'/cache=' + this.diskIO.joinPath(settings.buildPath, 'cache'),
			'/of=' + this.diskIO.joinPath(settings.buildPath, 'output', `${projectName}.${blob_extension}`),
			`/uf=${settings.user.fullPath}`,
			'/v'
		];

		if (settings.runtime.version.supportsPrefabsPath()) {
			if (settings.prefabsPath !== undefined) {
				flags.push(`/prefabs=${settings.prefabsPath}`);
			}
		}

		// ignore cache, this fixes changes not applying in yyc
		if (settings.runtimeType === 'YYC') {
			flags.push('/ic');
		}

		if (settings.threads !== undefined) {
			flags.push(`/j=${settings.threads}`);
		}

		if (settings.device !== undefined) {
			flags.push(
				`/df=${settings.device.filePath}`,
				`/device=${settings.device.name}`
			);
		}

		if (settings.noBuild) {
			flags.push('/nb');
		}

		/** @type {string} */
		let igorVerb = settings.task;

		switch (settings.platform) {
			case 'HTML5':
				if (settings.task === 'Package') {
					igorVerb = 'folder';
				}
			break;

			case 'Windows':
			case 'Mac':
				if (settings.task === 'Package') {
					igorVerb = 'PackageZip';
				}
			break;
		}

		flags.push('--');
		flags.push(settings.platform, igorVerb);

		return flags;
	}

	/**
	 * Check whether the given target platform requires a remote device to build to for the given task.
	 * 
	 * @private
	 * @param {GM.SupportedPlatform} platform 
	 * @param {GM.Task} task 
	 * @returns {boolean}
	 */
	requiresRemoteDevice(task, platform) {
		if (platform === HOST_PLATFORM) {
			return false;
		}

		switch (platform) {
			case 'Mac': return true;
			case 'Linux': return true;
			case 'Android': return task !== 'Package';
		}

		return false;
	}

	/**
	 * Remove a job from our tracked list.
	 * 
	 * @private
	 * @param {IgorJob} job
	 */
	removeJob(job) {
		const jobIndex = this.jobs.indexOf(job);

		if (jobIndex >= 0) {
			this.jobs.splice(jobIndex, 1);
		}
	}

	/**
	 * Retrieve a unique ID number for a job to be created. This value increments from `0`, and is the
	 * lowest integer that is not currently in use by any other job.
	 * 
	 * This ID system exists for one purpose only: to differentiate parallel-running jobs when the user
	 * executes multiple at once, so that they have different directories to one another. Initially,
	 * using GUIDs was considered - similar to what the IDE does, but this would mean that manual
	 * clean-up of the job folder would be necessary occasionally or it would grow infinitely.
	 * 
	 * @private
	 * @returns {number}
	 */
	getNewJobId() {
		let id = 0;

		while (this.jobs.some(job => job.id === id)) {
			id ++;
		}

		return id;
	}

}
