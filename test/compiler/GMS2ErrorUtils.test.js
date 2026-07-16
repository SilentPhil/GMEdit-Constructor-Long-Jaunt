import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

let GMS2ErrorUtils;

before(async () => {
	globalThis.$gmedit = {
		'parsers.GmlEvent': {},
		'parsers.GmlKeycode': {}
	};
	globalThis.GmlAPI = { gmlLookup: {} };

	({ GMS2ErrorUtils } = await import('../../js/compiler/job/errors/GMS2ErrorUtils.js'));
});

describe('GMS2ErrorUtils', () => {
	it('parses LTS-style generated script identifiers', () => {
		const result = GMS2ErrorUtils.parseScriptName(
			'gml_Script_anon_gui_MenuController_gml_GlobalScript_gui_MenuControllerNew_2235_gui_MenuController_gml_GlobalScript_gui_MenuControllerNew'
		);

		assert.equal(result.ok, true);
		assert.deepEqual(result.data, {
			type: 'Script',
			name: 'gui_MenuController',
			definedIn: {
				type: 'GlobalScript',
				name: 'gui_MenuControllerNew'
			}
		});
	});

	it('keeps underscores in LTS root script names', () => {
		const result = GMS2ErrorUtils.parseScriptName(
			'gml_Script_anon_some_method_gml_GlobalScript_root_script_name_4109_some_method_gml_GlobalScript_root_script_name'
		);

		assert.equal(result.ok, true);
		assert.equal(result.data.definedIn.name, 'root_script_name');
	});
});
