import { ConstructorTab } from '../tabs/ConstructorTab.js';
import { GmlFileUtils } from '../../utils/gmedit/GmlFileUtils.js';

const FileKind = $gmedit['file.FileKind'];
const GmlFile = $gmedit['gml.file.GmlFile'];

/**
 * 'Editor' for viewing a compile log all fancy.
 * @implements {UI.OutputLogDisplay}
 */
export class OutputLogTab extends ConstructorTab {
	/**
	 * @private
	 * @type {HTMLDivElement}
	 */
	errorsPage;

	/** @private */
	errorsHost = document.createElement('div');

	/**
	 * The original output nodes stay as direct children of the GMEdit tab. Ace and GMEdit both
	 * rely on that layout when calculating the editor height.
	 * @private
	 * @type {Node[]}
	 */
	outputElements = [];

	/** @private */
	tabList = document.createElement('nav');

	/** @private */
	outputTabButton = document.createElement('button');

	/** @private */
	errorsTabButton = document.createElement('button');

	/**
	 * @private
	 * @type {UI.OutputLogDisplay.Client|undefined}
	 */
	client = undefined;

	/**
	 * GMEdit calls `stateSave` and then `destroy`. If `destroy` is called by us though, its meaning
	 * is that of `Destroyable`, and should close the tab. GMEdit is calling it due to the tab
	 * already being the process of closing, so if `false`, then we shouldn't trigger a file close.
	 * 
	 * @private
	 */
	shouldCloseGMEditFile = true;

	/**
	 * @private
	 * @param {GMEdit.GmlFile} file
	 */
	constructor(file) {
		super(file);

		this.element.classList.add('gm-constructor-output-tabs', 'gm-constructor-viewer', 'popout-window');

		this.tabList.classList.add('gm-constructor-output-tab-list');
		this.tabList.setAttribute('role', 'tablist');
		this.tabList.setAttribute('aria-label', 'Job windows');

		this.configureTabButton(this.outputTabButton, 'Job Output', () => this.showPage('output'));
		this.configureTabButton(this.errorsTabButton, 'Error Window', () => this.showPage('errors'));
		this.tabList.append(this.outputTabButton, this.errorsTabButton);

		this.errorsPage = document.createElement('div');
		this.errorsPage.classList.add(
			'gm-constructor-output-tab-page',
			'gm-constructor-viewer-bottom-pane',
			'gm-constructor-viewer-errors'
		);
		this.errorsPage.setAttribute('role', 'tabpanel');
		this.errorsPage.addEventListener('gm-constructor-close-error', event => {
			event.detail.element.remove();
			if (this.errorsPage.childElementCount === 0) {
				this.setErrorsAvailable(false);
				this.showPage('output');
			}
			this.client?.displayResized();
		});

		this.errorsHost.classList.add('gm-constructor-output-errors-host');
		this.errorsHost.appendChild(this.errorsPage);
		this.element.appendChild(this.tabList);
		this.setErrorsAvailable(false);
		this.showPage('output');
	}

	/**
	 * @private
	 * @param {HTMLButtonElement} button
	 * @param {string} title
	 * @param {() => void} onClick
	 */
	configureTabButton(button, title, onClick) {
		button.type = 'button';
		button.textContent = title;
		button.classList.add('bottom-panel-tab');
		button.setAttribute('role', 'tab');
		button.addEventListener('click', onClick);
	}

	/**
	 * @private
	 * @param {'output'|'errors'} page
	 */
	showPage(page) {
		const showErrors = page === 'errors' && this.errorsPage.childElementCount > 0;

		if (showErrors) {
			this.outputElements.forEach(element => element.remove());
			this.errorsHost.prepend(this.tabList);
			if (this.errorsHost.parentElement !== this.element) {
				this.element.appendChild(this.errorsHost);
			}
		} else {
			this.errorsHost.remove();
			this.element.prepend(this.tabList);
			this.tabList.after(...this.outputElements);
		}
		this.outputTabButton.classList.toggle('active', !showErrors);
		this.errorsTabButton.classList.toggle('active', showErrors);
		this.outputTabButton.setAttribute('aria-selected', String(!showErrors));
		this.errorsTabButton.setAttribute('aria-selected', String(showErrors));

		requestAnimationFrame(() => this.client?.displayResized());
	}

	/**
	 * Show the tab strip only while there are two pages to choose from.
	 * @private
	 * @param {boolean} available
	 */
	setErrorsAvailable(available) {
		this.tabList.classList.toggle('has-multiple-tabs', available);
		this.tabList.style.display = available ? 'flex' : 'none';
		this.errorsTabButton.disabled = !available;
	}

	stateSave() {
		this.shouldCloseGMEditFile = false;
	}

	destroy() {
		this.client?.displayClosed();
		this.disconnect();

		if (this.shouldCloseGMEditFile) {
			this.shouldCloseGMEditFile = false;
			this.close();
		}
	}

	/**
	 * @type {UI.OutputLogDisplay['getClient']}
	 */
	getClient() {
		return this.client;
	}

	/**
	 * @type {UI.OutputLogDisplay['connect']}
	 */
	connect(client) {
		if (this.client !== undefined) {
			this.disconnect();
		}

		this.client = client;
		const content = client.getContent();
		this.outputElements = Array.from(content.childNodes);
		this.tabList.after(content);
		this.errorsPage.textContent = '';
		this.setErrorsAvailable(false);
		this.showPage('output');
	}

	/**
	 * @type {UI.OutputLogDisplay['disconnect']}
	 */
	disconnect() {
		if (this.client === undefined) {
			return;
		}

		this.outputElements.forEach(element => element.remove());
		this.outputElements = [];
		this.errorsHost.remove();
		this.errorsPage.textContent = '';
		this.setErrorsAvailable(false);
		this.showPage('output');
		this.client = undefined;
	}

	/**
	 * @type {UI.OutputLogDisplay['bringToForeground']}
	 */
	bringToForeground() {
		this.focus();
		requestAnimationFrame(() => this.client?.displayResized());
	}

	/**
	 * @type {UI.OutputLogDisplay['supportsTitle']}
	 */
	supportsTitle() {
		return true;
	}

	/**
	 * @type {UI.OutputLogDisplay['setTitle']}
	 */
	setTitle(title, status) {
		GmlFileUtils.rename(this.file, (status === undefined) ? title : `${title}: ${status}`);
	}

	/**
	 * @type {UI.OutputLogDisplay['addError']}
	 */
	addError(error) {
		this.errorsPage.prepend(error.asHTML());
		this.setErrorsAvailable(true);
		this.showPage('errors');
	}

	/**
	 * Create and open a new tab.
	 * @returns {OutputLogTab}
	 */
	static create() {
		const file = new GmlFile('Constructor Job', null, this.fileKind);

		const previousFile = GmlFile.current;
		GmlFile.openTab(file);

		// Change back to the current file rather than stealing focus, we only want to focus if
		// explicitly desired.
		previousFile?.tabEl?.click();

		return /** @type {OutputLogTab} */ (file.editor);
	}
	
	/**
	 * @private
	 */
	static fileKind = new class extends FileKind {
		constructor() {
			super();
			this.checkSelfForChanges = false;
		}

		/**
		 * @param {GMEdit.GmlFile} file
		 */
		init(file) {
			file.editor = new OutputLogTab(file);
		}
	};
}
