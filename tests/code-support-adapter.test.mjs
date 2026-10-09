import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inspectCodeSurface } from '../dist/adapters/code-support.js';
const input = (path, text) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });
test('named dispatch surfaces retain exact static evidence, alternate paths and incomplete coverage without unrelated literals', () => {
    const source = input('Dispatcher.cs', `class Dispatcher {
 void Dispatch(Message message) {
  // case "comment": Execute();
  void Local() { switch (message.Kind) { case "local": Execute(); break; } }
  System.Action callback = () => { switch (message.Kind) { case "lambda": Execute(); break; } };
  switch (message.Kind) {
   case "send":
   case "retry": Execute(); break;
   case "empty": break;
   default: break;
  }
 }
 void Consume() { foreach (var entry in Select("event", "adjust")) { Apply(entry); } }
 void Other() { switch (message.Kind) { case "unrelated": Execute(); break; } }
}`);
    const extra = input('Other.cs', 'class Other { void Elsewhere() {} }');
    const selectors = [{ kind: 'switch-case', within: 'Dispatch', expression: 'message.Kind' }, { kind: 'call-argument', within: 'Consume', callee: 'Select', argumentIndex: 1 }, { kind: 'switch-case', within: 'Missing', expression: 'message.Kind' }];
    const result = inspectCodeSurface([source, extra], selectors);
    assert.deepEqual(result.selectors.map(item => item.status), ['complete', 'complete', 'unknown']);
    assert.deepEqual(result.matches.map(item => [item.value, item.selector, item.source.line]), [['send', 0, 7], ['retry', 0, 8], ['adjust', 1, 13]]);
    assert.ok(result.matches.every(item => item.source.path === 'Dispatcher.cs' && item.source.contentHash === source.contentHash && item.source.endLine >= item.source.line));
    assert.equal(result.matches.some(item => item.value === 'absent'), false);
    assert.equal(inspectCodeSurface([source, input('Duplicate.cs', 'class Duplicate { void Dispatch(Message message) {} }')], selectors).selectors[0].status, 'unknown');
    const partial = inspectCodeSurface([input('Partial.cs', 'class Partial { void Dispatch(Message message) { switch(message.Kind) { case "send": Execute(); break; case $"dynamic": Execute(); break; default: throw new Error($"Unknown {message.Kind}"); } } }')], selectors.slice(0, 1));
    assert.equal(partial.selectors[0].status, 'unknown');
    assert.equal(partial.matches[0].value, 'send');
    const externalGap = inspectCodeSurface([source, input('Conditional.cs', '#if OPTIONAL\nclass Optional { void Other() {} }\n#endif')], selectors.slice(0, 1));
    assert.equal(externalGap.selectors[0].status, 'unknown');
    assert.deepEqual(externalGap.matches.map(match => match.value), ['send', 'retry']);
    const declarationsOnly = inspectCodeSurface([input('Declarations.cs', `class Declarations {
 void Dispatch(Message message) { switch(message.Kind) { case "ghost": void NeverCalled() { Execute(); } break; } }
 void Consume() { foreach(var entry in Select("event", "ghost")) { void NeverCalled() { Apply(entry); } } }
 void Commas() { foreach(var entry in Select(",", "ghost")) { Apply(entry); } }
}`)], [...selectors.slice(0, 2), { kind: 'call-argument', within: 'Commas', callee: 'Select', argumentIndex: 2 }]);
    assert.deepEqual(declarationsOnly.matches, []);
    assert.deepEqual(declarationsOnly.selectors.map(item => item.status), ['unknown', 'unknown', 'unknown']);
    const literalExpression = inspectCodeSurface([input('Literal.cs', 'class Literal { void Dispatch(Message message) { switch("message.Kind") { case "ghost": Execute(); break; } } }')], selectors.slice(0, 1));
    assert.equal(literalExpression.selectors[0].status, 'unknown');
    assert.deepEqual(literalExpression.matches, []);
});
