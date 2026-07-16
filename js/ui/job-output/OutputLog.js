import { IgorJob } from '../../compiler/job/IgorJob.js';
import { use } from '../../utils/scope-extensions/use.js';

const PreferencesUI = $gmedit['ui.Preferences'];

/**
 * @implements {UI.OutputLogDisplay.Client}
 */
export class JobOutputLog {
	/**
	 * @private
	 */
	static scrollGrabLines = 1;

	/**
	 * @type {JobOutputLog[]}
	 */
	static instances = [];

	/**
	 * @private
	 */
	header = document.createElement('header');

	/**
	 * @private
	 * @type {HTMLHeadingElement}
	 */
	jobNameHeading = document.createElement('h4');

	/**
	 * Ace instance which shows log output.
	 * 
	 * @private
	 * @type {AceAjax.Editor}
	 */
	logAceEditor = use(document.createElement('pre'))
		.also(it => it.classList.add('gm-constructor-log'))
		.let(it => GMEdit.aceTools.createEditor(it, { 
			statusBar: false,
			tooltips: false,
			completers: false,
			linter: false
		}))
		.also(it => it.setReadOnly(true))
		.also(it => it.session.setUndoManager(null))
		.also(it => it.setOption('scrollPastEnd', 0))
		.also(it => it.renderer.setShowGutter(false))
		.also(it => it.renderer.setShowPrintMargin(false))
		.value;

	/**
	 * @private
	 * @type {GM.Job.Error[]}
	 */
	errors = [];

	/**
	 * @private
	 */
	lastDetachedAt = 0;

	/**
	 * @type {UI.OutputLogDisplay|undefined}
	 */
	display = undefined;

	/**
	 * Keeps Ace's viewport in sync when a display is moved between GMEdit panels.
	 * @private
	 * @type {ResizeObserver|undefined}
	 */
	resizeObserver = undefined;

	/**
	 * @private
	 * @param {GM.Job} job 
	 * @param {UI.OutputLogDisplay} display 
	 */
	constructor(job, display, fontSize, errorDisplay) {
		this.job = job;
		this.display = display;
		this.errorDisplay = errorDisplay;
		this.setFontSize(fontSize);

		if (typeof ResizeObserver !== 'undefined') {
			this.resizeObserver = new ResizeObserver(() => this.displayResized());
			this.resizeObserver.observe(this.logAceEditor.container);
		}

		this.updateTitle();

		this.header.appendChild(this.jobNameHeading);

		const navButtonsGroup = document.createElement('nav');
		PreferencesUI.addButton(navButtonsGroup, 'Stop', this.stopJob);
		PreferencesUI.addButton(navButtonsGroup, 'Clear output', this.clearOutput);
		PreferencesUI.addButton(navButtonsGroup, 'Go to bottom', this.goToBottom);
		PreferencesUI.addButton(navButtonsGroup, 'Show directory', this.showDirectory);
		this.header.appendChild(navButtonsGroup);

		/** @private */
		this.jobEventGroup = job.events.createGroup({
			output: this.onJobOutput,
			stop: this.onJobStop,
			stopping: this.updateTitle
		});

		if (job instanceof IgorJob) {
			this.insertOutput(job.stdout);
		}

		/** @private */
		this.tickIntervalId = setInterval(this.updateTitle, 1000);
	}

	/**
	 * @param {TPreferences.OutputFontSize} fontSize
	 */
	setFontSize(fontSize) {
		this.logAceEditor.setOption('fontSize', fontSize);
		this.logAceEditor.resize();
	}

	/**
	 * @param {boolean} [closeDisplay]
	 */
	destroy(closeDisplay = true) {
		const instanceIndex = JobOutputLog.instances.indexOf(this);

		if (instanceIndex < 0) {
			return;
		}

		JobOutputLog.instances.splice(instanceIndex, 1);
		clearInterval(this.tickIntervalId);
		this.resizeObserver?.disconnect();
		this.resizeObserver = undefined;

		this.jobEventGroup.destroy();
		this.job.stop();
		this.errorDisplay?.destroy();
		this.errorDisplay = undefined;

		const display = this.display;
		this.display = undefined;

		if (display?.getClient() === this) {
			if (closeDisplay) {
				display.destroy();
			} else {
				display.disconnect();
			}
		}

		this.logAceEditor.destroy();
	}

	getContent() {
		const content = new DocumentFragment();
		content.appendChild(this.header);
		content.appendChild(this.logAceEditor.container);

		return content;
	}

	displayResized() {
		const followOutput = this.shouldFollowOutput();
		this.logAceEditor.resize();

		if (followOutput) {
			this.goToBottom();
		}
	}

	displayClosed() {
		this.display = undefined;
		this.lastDetachedAt = Date.now();
	}

	/**
	 * Attach this output log to a display.
	 * @param {UI.OutputLogDisplay} display
	 */
	attachDisplay(display) {
		const currentClient = display.getClient();

		if (currentClient instanceof JobOutputLog && currentClient !== this) {
			currentClient.destroy(false);
		}

		this.display = display;
		display.connect(this);
		if (this.errorDisplay === undefined) {
			this.errors.forEach(error => display.addError(error));
		}
		this.updateTitle();
		this.displayResized();
	}

	/**
	 * Go the the bottom of the log.
	 * @private
	 */
	goToBottom = () => {
		this.logAceEditor.navigateFileEnd();
		this.logAceEditor.scrollToLine(this.logAceEditor.session.getLength(), false, false, () => {});
	}

	/**
	 * Check whether we should be following the output downwards.
	 * 
	 * @private
	 * @returns {boolean}
	 */
	shouldFollowOutput() {
		const endRow = this.logAceEditor.session.doc.getLength();
		return (this.logAceEditor.renderer.getScrollBottomRow() >= (endRow - JobOutputLog.scrollGrabLines));
	}

	stopJob = () => {
		if (this.job === undefined) {
			return;
		}

		if (this.job.getState().status === 'running') {
			this.job.stop();
		}
	}

	/**
	 * Clear the visible output while continuing to show new output from a running job.
	 * @private
	 */
	clearOutput = () => {
		this.logAceEditor.session.setValue('');
		this.goToBottom();
	}

	/**
	 * Append content to the visible output.
	 *
	 * @private
	 * @param {string} content
	 */
	insertOutput(content) {
		if (content.length === 0) {
			return;
		}

		const session = this.logAceEditor.session;
		const lastRow = session.getLength() - 1;
		session.insert({
			row: lastRow,
			column: session.getLine(lastRow).length
		}, content);
	}

	/**
	 * Callback for new output from the attached Job.
	 * 
	 * @private
	 * @param {string} content New content from the Job's STDOUT or STDERR.
	 */
	onJobOutput = (content) => {
		const followOutput = this.shouldFollowOutput();
		const cursor = this.logAceEditor.getCursorPosition();

		this.insertOutput(content);
		this.logAceEditor.moveCursorToPosition(cursor);

		if (followOutput) {
			this.goToBottom();
		}
	}

	/**
	 * Callback on the completion of the attached Job.
	 * 
	 * @private
	 * @param {GM.Job.EventMap['stop']} event
	 */
	onJobStop = ({ errors }) => {
		clearInterval(this.tickIntervalId);
		this.updateTitle();
		this.errors.push(...errors);

		if (errors.length > 0) {
			if (this.errorDisplay !== undefined) {
				errors.forEach(it => this.errorDisplay.addError(it));
			} else if (this.display !== undefined) {
				errors.forEach(it => this.display.addError(it));
			}

			if (this.display !== undefined) {
				this.logAceEditor.resize();
				this.goToBottom();
			}
		}
	}

	/**
	 * Visit the output directory of the task.
	 */
	showDirectory = () => {
		Electron_Shell.showItemInFolder(this.job.buildPath);
	}

	/**
	 * Job "tick" function called every second to update the status bar. Later we'll chuck in a
	 * timer for how long the job has been running.
	 * 
	 * @private
	 */
	updateTitle = () => {
		let title = `${this.job.platform} ${this.job.task}`;

		if (JobOutputLog.instances.length > 1) {
			title += ` #${this.job.id}`;
		}

		const state = this.job.getState();
		
		/** @type {string|undefined} */
		let status = undefined;

		switch (state.status) {
			case 'running': break;
			case 'stopping': status =  'Stopping'; break;
			case 'stopped': status = state.stopType; break;
		}

		// TODO: Format time nicely here :)
		const duration = ((Date.now() - this.job.startTime.getTime()) / 1000).toString();

		if (this.display?.supportsTitle()) {
			this.display.setTitle(title, status);
			this.jobNameHeading.textContent = `${duration} seconds`;
		} else {
			if (status !== undefined) {
				title += `: ${status}`;
			}

			this.jobNameHeading.textContent = `${title} (${duration} seconds)`;
		}
	}

	get isRunning() {
		return this.job.getState().status !== 'stopped';
	}

	/**
	 * 
	 * @param {GM.Job} job 
	 * @param {UI.OutputLogDisplay} display 
	 */
	static create(job, display, fontSize, errorDisplay) {
		const outputLog = new JobOutputLog(job, display, fontSize, errorDisplay);
		JobOutputLog.instances.push(outputLog);

		outputLog.attachDisplay(display);
	}

	/**
	 * Apply a new font size to every open output log.
	 * @param {TPreferences.OutputFontSize} fontSize
	 */
	static setFontSize(fontSize) {
		JobOutputLog.instances.forEach(outputLog => outputLog.setFontSize(fontSize));
	}

	/**
	 * Find a finished instance to steal its display.
	 * @returns {JobOutputLog|undefined}
	 */
	static findIdle() {
		return this.instances.find(it => !it.isRunning) ?? this.instances[0];
	}

	/**
	 * Find the most recently closed output log.
	 * @returns {JobOutputLog|undefined}
	 */
	static findDetached() {
		return this.instances
			.filter(it => it.display === undefined)
			.sort((a, b) => b.lastDetachedAt - a.lastDetachedAt)[0];
	}
}
