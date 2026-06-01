import { path } from '../utils/node/node-import.js';

const PreferencesUI = $gmedit['ui.Preferences'];
const RUN_BUILD_COMPLETE_MARKER = '[Run] Run game';
const BUILD_OVERLAY_ICON = 'build-in-progress.png';

/**
 * Shows a Windows taskbar overlay icon while Constructor builds are in progress.
 *
 * @implements {Destroyable}
 */
export class TaskbarBuildIndicator {
	/**
	 * @private
	 * @type {Map<GM.Job, { eventGroup: Destroyable, project: GMEdit.Project }>}
	 */
	activeBuilds = new Map();

	/**
	 * @private
	 */
	buildIconPath;

	/**
	 * @param {string} pluginPath
	 */
	constructor(pluginPath) {
		const iconsPath = path.join(pluginPath, 'assets', 'icons');
		this.buildIconPath = path.join(iconsPath, BUILD_OVERLAY_ICON);
	}

	/**
	 * @param {GM.Job} job
	 * @param {GMEdit.Project} project
	 */
	track(job, project) {
		if (!this.isSupported()) {
			return;
		}

		this.activeBuilds.get(job)?.eventGroup.destroy();

		const eventGroup = job.events.createGroup({
			stdout: (stdout) => this.onJobStdout(job, project, stdout),
			stop: () => this.completeBuild(job, project)
		});

		this.activeBuilds.set(job, { eventGroup, project });
		this.refreshOverlay(project);
	}

	/**
	 * @param {GMEdit.Project|undefined} [project]
	 */
	destroy(project = undefined) {
		for (const activeBuild of this.activeBuilds.values()) {
			activeBuild.eventGroup.destroy();
		}

		this.activeBuilds.clear();
		this.restoreProjectOverlay(project);
	}

	/**
	 * @private
	 * @param {GM.Job} job
	 * @param {GMEdit.Project} project
	 * @param {string} stdout
	 */
	onJobStdout(job, project, stdout) {
		if (stdout.includes(RUN_BUILD_COMPLETE_MARKER)) {
			this.completeBuild(job, project);
		}
	}

	/**
	 * @private
	 * @param {GM.Job} job
	 * @param {GMEdit.Project} project
	 */
	completeBuild(job, project) {
		const activeBuild = this.activeBuilds.get(job);

		if (activeBuild === undefined) {
			return;
		}

		activeBuild.eventGroup.destroy();
		this.activeBuilds.delete(job);
		this.refreshOverlay(project);
	}

	/**
	 * @private
	 * @param {GMEdit.Project} project
	 */
	refreshOverlay(project) {
		const nextActiveJob = Array.from(this.activeBuilds.keys()).at(-1);

		if (nextActiveJob !== undefined) {
			this.setBuildOverlay(nextActiveJob);
			return;
		}

		this.restoreProjectOverlay(project);
	}

	/**
	 * @private
	 * @param {GM.Job} job
	 */
	setBuildOverlay(job) {
		this.setOverlay(
			this.buildIconPath,
			`Constructor ${job.task} in progress`
		);
	}

	/**
	 * @private
	 * @param {GMEdit.Project|undefined} project
	 */
	restoreProjectOverlay(project) {
		if (!this.isSupported()) {
			return;
		}

		const overlay = this.getProjectOverlay(project);
		this.setOverlay(overlay.path, overlay.description);
	}

	/**
	 * @private
	 * @param {GMEdit.Project|undefined} project
	 * @returns {{ path: string|null, description: string }}
	 */
	getProjectOverlay(project) {
		try {
			if (!PreferencesUI.current?.taskbarOverlays) {
				return { path: null, description: '' };
			}

			const version = project?.version;

			if (project === undefined || version === undefined || version.name === 'none') {
				return { path: null, description: '' };
			}

			const projectOverlayPath = `${project.path}.taskbar-overlay.png`;

			if (!project.isVirtual && Electron_FS.existsSync(projectOverlayPath)) {
				return { path: projectOverlayPath, description: '' };
			}

			const versionOverlayPath = path.join(version.dir, 'taskbar-overlay.png');

			if (Electron_FS.existsSync(versionOverlayPath)) {
				return { path: versionOverlayPath, description: version.label ?? '' };
			}
		} catch (_err) {
			return { path: null, description: '' };
		}

		return { path: null, description: '' };
	}

	/**
	 * @private
	 * @param {string|null} iconPath
	 * @param {string} description
	 */
	setOverlay(iconPath, description) {
		Electron_IPC.send('set-taskbar-icon', iconPath, description);
	}

	/**
	 * @private
	 * @returns {boolean}
	 */
	isSupported() {
		return typeof process !== 'undefined'
			&& process.platform === 'win32'
			&& typeof Electron_IPC !== 'undefined'
			&& Electron_IPC.send !== undefined;
	}
}
