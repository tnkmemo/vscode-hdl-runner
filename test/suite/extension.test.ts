import * as assert from 'assert';
import * as vscode from 'vscode';

suite('HDL Runner Activation Test', () => {
  test('Extension should be activated', async () => {
    const extensionId = 'tnkmemo.vscode-hdl-runner';
    const extension = vscode.extensions.getExtension(extensionId);

    assert.ok(extension, 'Extension not found');

    await extension?.activate();

    assert.strictEqual(extension?.isActive, true, 'Extension did not activate');
  });
});