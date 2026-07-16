/**
 * Controller for the Preferences configuration on the menu.
 */

import * as ui from '../ui/ui-wrappers.js';
import { GM_RELEASE_CHANNELS, Preferences, GMS2_RUNTIME_TYPES } from '../preferences/Preferences.js';
import { use } from '../utils/scope-extensions/use.js';
import { Dropdown } from './components/Dropdown.js';
import { mapToOption, Some } from '../utils/Option.js';
import { TextField } from './components/TextField.js';
import { docString } from '../utils/StringUtils.js';
import { Checkbox } from './components/Checkbox.js';

/**
 * @implements {Destroyable}
 */
export class PreferencesMenu {

	/**
	 * The root element of the menu.
	 */
	element = document.createElement('div');

	/**
	 * @private
	 * @type {Preferences}
	 */
	preferences;

	/**
	 * @private
	 * @type {{
	 * 		[key in GM.ReleaseChannel]: {
	 * 			userDropdown: UI.Dropdown<GM.User>,
	 * 			runtimesDirInput: TextField,
	 * 			installDataDirInput: TextField,
	 * 			prefabsDirInput: TextField,
	 * 		}
	 * }}
	 */
	channelWidgets = {
		// @ts-expect-error Filled in during the constructor.
		'Monthly': {},
		// @ts-expect-error Filled in during the constructor.
		'Beta': {},
		// @ts-expect-error Filled in during the constructor.
		'LTS 2022': {},
		// @ts-expect-error Filled in during the constructor.
		'LTS 2026': {},
	};

	/**
	 * @param {Preferences} preferences The preferences instance to bind to.
	 */
	constructor(preferences) {

		this.preferences = preferences;

		use(document.createElement('section')).also(section => {

			section.appendChild(ui.h3('Plugin Behaviour'));

			this.checkForUpdatesCheckbox = new Checkbox('Automatically check for updates',
					this.preferences.checkForUpdates,
					(value) => { this.preferences.checkForUpdates = value }
				)
				.tooltip('Whether to check for updates on startup via GitHub.')
				.appendTo(section);

			this.saveOnRunCheckbox = new Checkbox('Auto-save open files when running tasks',
					this.preferences.saveOnRun,
					(value) => { this.preferences.saveOnRun = value }
				)
				.tooltip('Whether to automatically save when you run a project task.')
				.appendTo(section);

			this.reuseOutputTabCheckbox = new Checkbox('Reuse existing compiler tab',
					this.preferences.reuseOutputTab,
					(value) => { this.preferences.reuseOutputTab = value }
				)
				.tooltip(docString(`
					Whether to reuse an existing compiler output tab for re-running. This may be
					useful to disable if you intentionally want to run multiple at a time, e.g. for
					multiplayer.
				`))
				.appendTo(section);

			this.showTooltipHintsCheckbox = new Checkbox('Show hints for options with help text',
					this.preferences.showTooltipHints,
					(value) => { this.preferences.showTooltipHints = value }
				)
				.tooltip(docString(`
					Whether to show visual indicators beside options on this page that have tooltip
					text you can view by hovering over them.
				`))
				.appendTo(section);
			
			this.outputPositionDropdown = new Dropdown('Job Output Style',
					Some(this.preferences.outputPosition),
					(value) => { this.preferences.outputPosition = value },
					/** @type {ReadonlyArray<UI.Dropdown.Entry<TPreferences.OutputPosition>>} */ ([
						{
							label: 'GMEdit Tab',
							value: 'fullTab'
						},
						{
							label: 'Bottom Panel Tab (Official IDE\'s style)',
							value: 'bottomPane'
						},
						{
							label: 'Right Panel',
							value: 'rightPane'
						}
					])
				)
				.tooltip(docString(`
					Where output logs and errors should be displayed when compiling and running
					projects.
				`))
				.singleline()
				.appendTo(section);

			this.errorPositionDropdown = new Dropdown('Job Error Position',
					Some(this.preferences.errorPosition),
					(value) => { this.preferences.errorPosition = value },
					/** @type {ReadonlyArray<UI.Dropdown.Entry<TPreferences.ErrorPosition>>} */ ([
						{ label: 'Same as Job Output', value: 'sameAsOutput' },
						{ label: 'Bottom Panel', value: 'bottomPanel' },
						{ label: 'Lower-left Panel', value: 'leftBottomPanel' }
					])
				)
				.tooltip(docString(`
					Where the error list should be shown when a job fails. The lower-left option
					requires a GMEdit build that provides that panel and otherwise falls back to
					the job output location.
				`))
				.singleline()
				.appendTo(section);

			this.outputFontSizeDropdown = new Dropdown('Job Output Font Size',
					Some(this.preferences.outputFontSize),
					(value) => { this.preferences.outputFontSize = value },
					/** @type {ReadonlyArray<UI.Dropdown.Entry<TPreferences.OutputFontSize>>} */ ([
						{ label: 'Small (10 px)', value: 10 },
						{ label: 'Medium (12 px)', value: 12 },
						{ label: 'Large (14 px)', value: 14 },
						{ label: 'Extra large (16 px)', value: 16 }
					])
				)
				.tooltip('Font size used by the compiler output log in every output style.')
				.singleline()
				.appendTo(section);

			this.shouldFocusOutputCheckbox = new Checkbox('Focus job output when starting a job',
					this.preferences.shouldFocusOutput,
					(value) => { this.preferences.shouldFocusOutput = value }
				)
				.tooltip(docString(`
					Whether, upon starting a new job, the job's output should be put in the
					foreground. If you'd rather the job run in the background, disable this.
				`))
				.appendTo(section);
		
		}).also(it => this.element.appendChild(it));

		use(document.createElement('section')).also(section => {

			section.appendChild(ui.h3('Paths'));

			this.globalBuildsPathInput = new TextField('Global Builds Path',
					this.preferences.globalBuildPath,
					(value) => { this.preferences.globalBuildPath = value }
				)
				.tooltip(docString(`
					Path to a central builds directory, which Constructor manages for you. Stops
					your project's directory being clogged by build files.
				`))
				.appendTo(section);

			this.useGlobalBuildPathCheckbox = new Checkbox('Use the global builds directory',
					this.preferences.useGlobalBuildPath,
					(value) => { this.preferences.useGlobalBuildPath = value }
				)
				.tooltip(docString(`
					Whether to use the global builds directory, or instead to place build files in
					the project's own directory.
				`))
				.appendTo(section);

			for (const channel of GM_RELEASE_CHANNELS) {

				const widgets = this.channelWidgets[channel];
				const group = ui.group(section, channel);

				widgets.runtimesDirInput = new TextField('Runtimes Directory',
					this.preferences.getRuntimeSearchPath(channel),
					async (path) => {
						await this.preferences.setRuntimeSearchPath(channel, path)
					}
				).appendTo(group);

				widgets.installDataDirInput = new TextField('Installation Data Directory',
					this.preferences.getUserSearchPath(channel),
					async (path) => {
						await this.preferences.setUserSearchPath(channel, path);
					}
				).appendTo(group);

				const users = this.preferences.getUsers(channel);
		
				widgets.userDropdown = new Dropdown('User',
						mapToOption(this.preferences.getDefaultUser(channel)),
						(value) => this.preferences.setDefaultUser(channel, value),
						users?.map(user => ({ label: user.name, value: user })) ?? [],
						(a, b) => a.fullPath === b.fullPath
					)
					.visible(users !== undefined)
					.appendTo(group);

				widgets.prefabsDirInput = new TextField('Prefab Library Path',
						this.preferences.getPrefabsPath(channel),
						(path) => this.preferences.setPrefabsPath(channel, path.trim())
					)
					.tooltip(docString(`
						Directory where your prefabs are located. This is usually the path you've
						set in the GameMaker IDE's Package Manager preferences.
					`))
					.appendTo(group);

				// Presumably not-installed groups can start collapsed, since the user probably
				// doesn't care about them unless they specifically want to set them up.
				const runtimes = this.preferences.getRuntimes(channel);

				widgets.runtimesDirInput.hasError(runtimes === undefined);
				widgets.installDataDirInput.hasError(users === undefined);

				if ((runtimes === undefined) && (users === undefined)) {
					group.classList.add('collapsed');
				}
		
			}	
		
		}).also(it => this.element.appendChild(it));

		this.onSetShowTooltipHints({ showTooltipHints: this.preferences.showTooltipHints });

		/** @private */
		this.preferencesEventGroup = this.preferences.events.createGroup({
			setCheckForUpdates: this.onSetCheckForUpdates,
			setSaveOnRun: this.onSetSaveOnRun,
			setReuseOutputTab: this.onSetReuseOutputTab,
			setShowTooltipHints: this.onSetShowTooltipHints,
			setOutputPosition: this.onSetOutputPosition,
			setErrorPosition: this.onSetErrorPosition,
			setOutputFontSize: this.onSetOutputFontSize,
			setShouldFocusOutput: this.onSetShouldFocusOutput,
			setUseGlobalBuildPath: this.onSetUseGlobalBuildPath,
			setGlobalBuildPath: this.onSetGlobalBuildPath,
			setPrefabsPath: this.onSetPrefabsPath,
			userListChanged: this.onUserListChanged,
			runtimeListChanged: this.onRuntimeListChanged
		});

	}

	/**
	 * Clean up this preferences menu instance.
	 */
	destroy() {
		this.preferencesEventGroup.destroy();
	}

	/**
	 * @private
	 * @param {TPreferences.PreferencesEventMap['setCheckForUpdates']} event
	 */
	onSetCheckForUpdates = ({ checkForUpdates }) => {
		this.checkForUpdatesCheckbox.value = checkForUpdates;
	}

	/**
	 * @private
	 * @param {TPreferences.PreferencesEventMap['setSaveOnRun']} event
	 */
	onSetSaveOnRun = ({ saveOnRun }) => {
		this.saveOnRunCheckbox.value = saveOnRun;
	}

	/**
	 * @private
	 * @param {TPreferences.PreferencesEventMap['setReuseOutputTab']} event
	 */
	onSetReuseOutputTab = ({ reuseOutputTab }) => {
		this.reuseOutputTabCheckbox.value = reuseOutputTab;
	}

	/**
	 * @private
	 * @param {TPreferences.PreferencesEventMap['setShowTooltipHints']} event
	 */
	onSetShowTooltipHints = ({ showTooltipHints }) => {
		this.showTooltipHintsCheckbox.value = showTooltipHints;
		this.element.classList.toggle('gm-constructor-show-tooltip-indicators', showTooltipHints);
	}

	/**
	 * @private
	 * @param {TPreferences.PreferencesEventMap['setOutputPosition']} outputPosition
	 */
	onSetOutputPosition = (outputPosition) => {
		this.outputPositionDropdown.setSelectedOption(outputPosition);
	}

	/**
	 * @private
	 * @param {TPreferences.PreferencesEventMap['setErrorPosition']} errorPosition
	 */
	onSetErrorPosition = (errorPosition) => {
		this.errorPositionDropdown.setSelectedOption(errorPosition);
	}

	/**
	 * @private
	 * @param {TPreferences.PreferencesEventMap['setOutputFontSize']} outputFontSize
	 */
	onSetOutputFontSize = (outputFontSize) => {
		this.outputFontSizeDropdown.setSelectedOption(outputFontSize);
	}

	/**
	 * @private
	 * @param {TPreferences.PreferencesEventMap['setShouldFocusOutput']} shouldFocusOutput
	 */
	onSetShouldFocusOutput = (shouldFocusOutput) => {
		this.shouldFocusOutputCheckbox.value = shouldFocusOutput;
	}

	/**
	 * @private
	 * @param {TPreferences.PreferencesEventMap['setUseGlobalBuildPath']} event
	 */
	onSetUseGlobalBuildPath = ({ useGlobalBuildPath }) => {
		this.useGlobalBuildPathCheckbox.value = useGlobalBuildPath;
	}

	/**
	 * @private
	 * @param {TPreferences.PreferencesEventMap['setGlobalBuildPath']} event
	 */
	onSetGlobalBuildPath = ({ globalBuildPath }) => {
		this.globalBuildsPathInput.value = globalBuildPath;
	}
	
	/**
	 * @private
	 * @param {TPreferences.PreferencesEventMap['setPrefabsPath']} event
	 */
	onSetPrefabsPath = ({ channel, prefabsPath }) => {
		this.channelWidgets[channel].prefabsDirInput.value = prefabsPath;
	}

	/**
	 * Update the user dropdown when the list of users change for that channel.
	 * 
	 * @private
	 * @param {TPreferences.PreferencesEventMap['userListChanged']} event
	 */
	onUserListChanged = ({ channel, usersInfo }) => {
		
		const { userDropdown, installDataDirInput } = this.channelWidgets[channel];

		if (usersInfo === undefined) {
			userDropdown.visible(false);
			installDataDirInput.hasError(true);

			return;
		}

		userDropdown.setOptions(usersInfo.users.map(user => ({
			label: user.name,
			value: user
		})), usersInfo.defaultUser);

		userDropdown.visible(true);
		installDataDirInput.hasError(false);

	}

	/**
	 * Update whether to show an error for the runtimes path.
	 * 
	 * @private
	 * @param {TPreferences.PreferencesEventMap['runtimeListChanged']} event
	 */
	onRuntimeListChanged = ({ channel, runtimesInfo }) => {
		const { runtimesDirInput } = this.channelWidgets[channel];
		runtimesDirInput.hasError(runtimesInfo === undefined);
	}

}
