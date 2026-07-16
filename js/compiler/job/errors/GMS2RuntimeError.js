import * as ui from '../../../ui/ui-wrappers.js';
import { errorPositionAsHTML } from './errorPositionAsHTML.js';

const OpenDeclaration = $gmedit['ui.OpenDeclaration'];

async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch (_) {
		const input = document.createElement('textarea');
		input.value = text;
		input.style.position = 'fixed';
		input.style.opacity = '0';
		document.body.appendChild(input);
		input.select();
		const copied = document.execCommand('copy');
		input.remove();
		return copied;
	}
}

/** 
 * An error that occurred at runtime.
 * @type {GM.Job.ErrorDescriptor} 
 */
export const GMS2RuntimeError = {

	/**
	 * Some silly regex that captures an error in either the 2024.400<= or 2024.600+ format, since
	 * they randomly changed it ever-so-slightly.
	 */
	regex: /^ERROR!!! :: #+\nERROR in\saction number 1\sof (?<event>[A-Za-z0-9 ]+?)\sfor object (?<object>\S+?):\n+(?<exception>[\s\S]+?)(\n at [^\n]+)?\n#+\n(?<stackTrace>(?:gml_.+?\n)+)/m,

	asHTML: ({ event, object, stackTrace, exception }) => {

		const group = document.createElement('div');
		group.className = 'gm-constructor-runtime-error';

		const stackTraceInfo = stackTrace
			.split('\n')
			.map(line => line.match(/(?<scriptName>gml_\S+) \(line (?<lineNumber>[0-9]+)\)(?:\s-\s+(?<sourceLine>.+))?/))
			.filter(matches => matches !== null)
			.map(matches => matches.groups)
			.filter(groups => groups !== undefined)
			.map(groups => ({
				rawScriptName: groups.scriptName,
				lineNumber: Number(groups.lineNumber),
				sourceLine: groups.sourceLine ?? undefined
			}));

		const summary = document.createElement('div');
		summary.className = 'gm-constructor-runtime-error-summary';
		const summaryText = document.createElement('div');
		summaryText.className = 'gm-constructor-runtime-error-summary-text';

		if (object !== '<undefined>') {
			const context = document.createElement('div');
			context.className = 'gm-constructor-runtime-error-context';
			context.append(ui.b(event), ' of object ', ui.code(object), ':');
			summaryText.appendChild(context);
		}

		const exceptionElement = document.createElement('pre');
		exceptionElement.className = 'gm-constructor-runtime-error-message';
		exceptionElement.textContent = exception;
		summaryText.appendChild(exceptionElement);
		summary.appendChild(summaryText);

		const actions = document.createElement('div');
		actions.className = 'gm-constructor-runtime-error-actions';

		const copyButton = document.createElement('button');
		copyButton.type = 'button';
		copyButton.className = 'gm-constructor-runtime-error-copy';
		copyButton.textContent = 'Copy';
		copyButton.title = 'Copy error and call stack';
		copyButton.addEventListener('click', async () => {
			const contextText = object === '<undefined>' ? '' : `${event} of object ${object}:`;
			const displayedStack = Array.from(
				group.querySelectorAll('.gm-constructor-runtime-stack-frame'),
				frame => frame.textContent?.trim() ?? ''
			).join('\n');
			const text = [contextText, exception.trim(), displayedStack]
				.filter(part => part.length > 0)
				.join('\n\n');
			const copied = await copyText(text);
			copyButton.textContent = copied ? 'Copied' : 'Copy failed';
			setTimeout(() => { copyButton.textContent = 'Copy'; }, 1200);
		});
		actions.appendChild(copyButton);

		const closeButton = document.createElement('button');
		closeButton.type = 'button';
		closeButton.className = 'gm-constructor-runtime-error-copy gm-constructor-runtime-error-close';
		closeButton.textContent = 'Close';
		closeButton.title = 'Close this error';
		closeButton.addEventListener('click', () => {
			group.dispatchEvent(new CustomEvent('gm-constructor-close-error', {
				bubbles: true,
				detail: { element: group }
			}));
		});
		actions.appendChild(closeButton);
		summary.appendChild(actions);
		group.appendChild(summary);

		const stackList = document.createElement('ul');
		stackList.className = 'gm-constructor-runtime-stack';

		for (const info of stackTraceInfo) {
			const listItem = document.createElement('li');
			const element = document.createElement('button');
			element.type = 'button';
			element.className = 'gm-constructor-runtime-stack-frame';
			element.title = `${info.rawScriptName}, line ${info.lineNumber}`;
			element.addEventListener('click', () => {
				const previous = stackList.querySelector('.gm-constructor-runtime-stack-frame.selected');
				if (previous !== null) {
					previous.classList.remove('selected');
					previous.removeAttribute('aria-current');
				}
				element.classList.add('selected');
				element.setAttribute('aria-current', 'location');
			});
			errorPositionAsHTML(element, info.rawScriptName, info.lineNumber, true);

			if (info.sourceLine !== undefined) {
				element.append(' — ');
				element.appendChild(ui.code(info.sourceLine));
			}

			listItem.appendChild(element);
			stackList.appendChild(listItem);
		}

		group.appendChild(stackList);

		return group;

	}

};
