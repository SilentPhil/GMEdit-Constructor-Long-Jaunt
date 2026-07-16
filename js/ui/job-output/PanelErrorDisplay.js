/** Displays job errors in one of GMEdit's shared panel APIs. */
export class PanelErrorDisplay {
	/**
	 * @param {{add(name: string, element: HTMLElement): void, set(name: string): void, remove(name: string, element?: HTMLElement): boolean}} panel
	 * @param {string} name
	 */
	constructor(panel, name) {
		this.panel = panel;
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

	registered = false;

	onCloseError = (event) => {
		event.detail.element.remove();
		if (this.element.childElementCount === 0) {
			this.destroy();
		}
	}

	/** @param {GM.Job.Error} error */
	addError(error) {
		if (!this.registered) {
			this.panel.add(this.name, this.element);
			this.registered = true;
		}

		this.element.appendChild(error.asHTML());
		this.panel.set(this.name);
	}

	destroy() {
		if (this.registered) {
			this.panel.remove(this.name, this.element);
			this.registered = false;
		}
		this.element.removeEventListener('gm-constructor-close-error', this.onCloseError);
		this.element.remove();
	}
}
