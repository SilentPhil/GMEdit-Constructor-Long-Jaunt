/** Error-only display backed by Constructor's legacy bottom pane. */
export class BottomPaneErrorDisplay {
	/** @param {import('../BottomPane.js').BottomPane} bottomPane @param {string} name */
	constructor(bottomPane, name) {
		this.bottomPane = bottomPane;
		this.name = name;
		this.element = document.createElement('div');
		this.element.classList.add(
			'gm-constructor-tab',
			'gm-constructor-viewer-bottom-pane',
			'gm-constructor-viewer-errors',
			'popout-window'
		);
		this.element.addEventListener('gm-constructor-close-error', this.onCloseError);
	}

	/** @type {UI.Tab|undefined} */
	tab = undefined;

	onCloseError = (event) => {
		event.detail.element.remove();
		if (this.element.childElementCount === 0) {
			this.destroy();
		}
	}

	/** @param {GM.Job.Error} error */
	addError(error) {
		if (this.tab === undefined) {
			this.tab = this.bottomPane.openTab(this.name, this.element);
			this.tab.events.on('close', () => {
				this.tab = undefined;
			});
		}

		this.element.appendChild(error.asHTML());
		this.bottomPane.show();
		this.bottomPane.showTab(this.tab);
		GMEdit.bottomPanel?.set('Job Output');
	}

	destroy() {
		const tab = this.tab;
		this.tab = undefined;
		if (tab !== undefined) {
			this.bottomPane.closeTab(tab);
		}
		this.element.removeEventListener('gm-constructor-close-error', this.onCloseError);
		this.element.remove();
	}
}
