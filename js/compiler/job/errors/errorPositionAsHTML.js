import * as ui from '../../../ui/ui-wrappers.js';
import { GMS2ErrorUtils } from './GMS2ErrorUtils.js';

const OpenDeclaration = $gmedit['ui.OpenDeclaration'];

// FIXME: this is really gross, give it a refactor :P
/**
 * 
 * @param {HTMLElement} group
 * @param {string} scriptString 
 * @param {number} lineNumber
 * @param {boolean} [wholeElementButton] Make `group` itself the navigation control.
 */
export function errorPositionAsHTML(group, scriptString, lineNumber, wholeElementButton = false) {
	const infoRes = GMS2ErrorUtils.parseScriptName(scriptString);
	const appendPosition = (label, callback) => {
		if (wholeElementButton) {
			const location = document.createElement('span');
			location.className = 'gm-constructor-error-position-link';
			location.textContent = label;
			group.appendChild(location);
			group.addEventListener('click', callback);
		} else group.appendChild(ui.textButton(label, callback));
	};

	if (infoRes.ok) {
		const info = infoRes.data;

		switch (info.type) {
			case 'GlobalScript':
				appendPosition(`${info.name}, line ${lineNumber}`, () =>
					OpenDeclaration.openLink(`${info.name}:${lineNumber}`, null)
				);
			break;

			case 'Script':
				let rootParent = info.definedIn;

				while (rootParent.type === 'Script') {
					rootParent = rootParent.definedIn;
				}

				switch (rootParent.type) {
					case 'GlobalScript':
						appendPosition(`Function ${info.name} (in Script ${rootParent.name}), line ${lineNumber}`, () =>
							OpenDeclaration.openLink(`${rootParent.name}:${lineNumber}`, null)
						);
					break;

					case 'Object':
						// FIXME: mysteriously we're getting off-by-one line numbers but only sometimes??? Is GMEdit doing this???
						appendPosition(`Function ${info.name} (in ${rootParent.objectName}'s ${rootParent.formattedEventName} Event), line ${lineNumber}`, () =>
							OpenDeclaration.openLink(`${rootParent.objectName}(${rootParent.internalEventName}):${lineNumber}`, null)
						);
					break;
				}
			break;

			case 'Object':
				// FIXME: mysteriously we're getting off-by-one line numbers but only sometimes??? Is GMEdit doing this???
				appendPosition(`${info.objectName}'s ${info.formattedEventName} Event, line ${lineNumber}`, () =>
					OpenDeclaration.openLink(`${info.objectName}(${info.internalEventName}):${lineNumber}`, null)
				);
			break;
		}
	} else {
		// Fallback to no link, with tooltip explanation. :(
		const locationElement = document.createElement('span');
		locationElement.appendChild(ui.code(scriptString));
		locationElement.append(`, line ${lineNumber}`);
		
		group.title = `No go-to-line, sorry:\n${infoRes.err}`;
		group.classList.add('gm-constructor-give-tooltip-indicator');
		if (wholeElementButton && group instanceof HTMLButtonElement) group.disabled = true;
		group.appendChild(locationElement);
	}
}
