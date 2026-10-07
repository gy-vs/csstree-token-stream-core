import assert from 'assert';
import fs from 'fs';
import { parse, tokenize, tokenTypes, tokenNames, walk, List } from 'css-tree';
import { forEachTest as forEachAstTest } from './fixture/ast.js';

const genericTypesFixture = JSON.parse(fs.readFileSync('./fixtures/definition-syntax-match/generic.json'));
const stringifyWithNoLoc = ast => JSON.stringify(ast, (key, value) => key !== 'loc' ? value : undefined, 4);

function createParseErrorTest(name, test, options) {
    (test.skip ? it.skip : it)(`${name} ${JSON.stringify(test.source)}`, () => {
        let error;

        assert.throws(
            () => parse(test.source, options),
            (e) => {
                error = e;
                if (e instanceof parse.SyntaxError === false) {
                    return true;
                }
            },
            'Should be a CSS parse error'
        );

        assert.strictEqual(error.message, test.error);
        assert.deepStrictEqual({
            offset: error.offset,
            line: error.line,
            column: error.column
        }, test.position);
    });
}

describe('parse', () => {
    describe('basic', () => {
        forEachAstTest((name, test) => {
            (test.skip ? it.skip : it)(name, () => {
                const ast = parse(test.source, test.options);

                // AST should be equal
                assert.strictEqual(stringifyWithNoLoc(ast), stringifyWithNoLoc(test.ast));
            });
        });

        describe('AnPlusB', () => {
            const fixture = genericTypesFixture['<an-plus-b>'];

            fixture.valid.forEach(value => {
                it(value, () => {
                    const actual = parse(':nth-child(' + value + ')', { context: 'selector' }).children.first.children.first.nth;
                    const a = value.match(/^([+-]?)(\d+)?n/i);
                    const b = value.match(/([+-]?)\s*(\d+)$/);
                    const expected = {
                        type: 'AnPlusB',
                        a: a ? (a[1] === '-' ? '-' : '') + (a[2] || '1') : null,
                        b: b ? (b[1] === '-' ? '-' : '') + b[2] : null
                    };

                    // AST should be equal
                    assert.strictEqual(stringifyWithNoLoc(actual), stringifyWithNoLoc(expected));
                });
            });

            fixture.invalid
                .filter(value => value !== '')
                .forEach(value =>
                    it(value, () =>
                        assert.throws(
                            () => parse(':nth-child(' + value + ')', { context: 'selector' })
                        )
                    )
                );
        });

        describe('UnicodeRange', () => {
            const fixture = genericTypesFixture['<urange>'];

            fixture.valid.forEach(value => {
                it(value, () => {
                    const actual = parse(value, { context: 'value' }).children.first;
                    const expected = {
                        type: 'UnicodeRange',
                        value
                    };

                    // AST should be equal
                    assert.strictEqual(stringifyWithNoLoc(actual), stringifyWithNoLoc(expected));
                });
            });

            fixture.invalid.forEach(value => {
                it(value, () => {
                    assert.throws(() => {
                        const actual = parse(value, { context: 'value' });
                        const expected = {
                            type: 'Value',
                            children: [{
                                type: 'Raw',
                                value
                            }]
                        };

                        // AST should not be equal
                        assert.strictEqual(stringifyWithNoLoc(actual), stringifyWithNoLoc(expected));
                    });
                });
            });
        });
    });

    describe('context', () => {
        it('should take parse context', () => {
            assert.deepStrictEqual(parse('property: value'), {
                type: 'StyleSheet',
                loc: null,
                children: new List().appendData({
                    type: 'Raw',
                    loc: null,
                    value: 'property: value'
                })
            });

            assert.deepStrictEqual(parse('property: value', {
                context: 'declaration'
            }), {
                type: 'Declaration',
                loc: null,
                important: false,
                property: 'property',
                value: {
                    type: 'Value',
                    loc: null,
                    children: new List().appendData({
                        type: 'Identifier',
                        loc: null,
                        name: 'value'
                    })
                }
            });
        });

        it('wrong context', () => {
            assert.throws(() => {
                parse('a{}', { context: 'unknown' });
            }, /Unknown context `unknown`/);
        });
    });

    it('should call onParseError when handler is passed', () => {
        const errors = [];
        const ast = parse('{a: 1!; foo; b: 2}', {
            context: 'block',
            onParseError: (error, fallbackNode) => errors.push({ error, fallbackNode })
        });

        assert.strictEqual(ast.children.size, 3);
        assert.strictEqual(errors.length, 2);
        assert.strictEqual(errors[0].error.message, 'Identifier is expected');
        assert.strictEqual(errors[0].fallbackNode.value, 'a: 1!;');
        assert.strictEqual(errors[1].error.message, 'Colon is expected');
        assert.strictEqual(errors[1].fallbackNode.value, 'foo;');
    });

    describe('errors', () => {
        const throwOnParseErrorOptions = {
            onParseError: e => {
                throw e;
            }
        };

        forEachAstTest((name, test) => {
            createParseErrorTest(name, test, {
                ...test.options,
                positions: false
            });
            createParseErrorTest(name + ' (with positions)', test, {
                ...test.options,
                positions: true
            });
        }, true);

        it('formattedMessage', () => {
            assert.throws(
                () => parse('/**/\n.\nfoo', throwOnParseErrorOptions),
                (e) => {
                    assert.strictEqual(e.formattedMessage,
                        'Parse error: Identifier is expected\n' +
                        '    1 |/**/\n' +
                        '    2 |.\n' +
                        '--------^\n' +
                        '    3 |foo'
                    );
                    assert.strictEqual(e.sourceFragment(),
                        '    2 |.\n' +
                        '--------^'
                    );
                    assert.strictEqual(e.sourceFragment(3),
                        '    1 |/**/\n' +
                        '    2 |.\n' +
                        '--------^\n' +
                        '    3 |foo'
                    );

                    return true;
                }
            );
        });

        it('formattedMessage at eof', () => {
            assert.throws(
                () => parse('.', throwOnParseErrorOptions),
                (e) => {
                    assert.strictEqual(e.formattedMessage,
                        'Parse error: Identifier is expected\n' +
                        '    1 |.\n' +
                        '--------^'
                    );

                    return true;
                }
            );
        });

        it('formattedMessage (windows new lines)', () => {
            assert.throws(
                () => parse('/**/\r\n.\r\nfoo', throwOnParseErrorOptions),
                (e) => {
                    assert.strictEqual(e.formattedMessage,
                        'Parse error: Identifier is expected\n' +
                        '    1 |/**/\n' +
                        '    2 |.\n' +
                        '--------^\n' +
                        '    3 |foo'
                    );
                    assert.strictEqual(e.sourceFragment(),
                        '    2 |.\n' +
                        '--------^'
                    );
                    assert.strictEqual(e.sourceFragment(3),
                        '    1 |/**/\n' +
                        '    2 |.\n' +
                        '--------^\n' +
                        '    3 |foo'
                    );

                    return true;
                }
            );
        });

        it('formattedMessage with tabs', () => {
            assert.throws(() => {
                parse('a {\n\tb:\tc#\t\n}', throwOnParseErrorOptions);
            }, function(e) {
                assert.strictEqual(e.formattedMessage,
                    'Parse error: Hex or identifier is expected\n' +
                    '    1 |a {\n' +
                    '    2 |    b:    c#    \n' +
                    '-------------------^\n' +
                    '    3 |}'
                );

                return true;
            });
        });

        it('formattedMessage for source with long lines', () => {
            assert.throws(
                () => parse(
                    '/*' + '1234567890'.repeat(20) + '*/\n' +
                    ' '.repeat(117) + '.\n' +
                    'foo\n' +
                    ' '.repeat(120) + 'bar',
                    throwOnParseErrorOptions
                ),
                (e) => {
                    assert.strictEqual(e.formattedMessage,
                        'Parse error: Identifier is expected\n' +
                        '    1 |…12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678…\n' +
                        '    2 |…                                                       .\n' +
                        '----------------------------------------------------------------^\n' +
                        '    3 |\n' +
                        '    4 |…                                                          bar'
                    );

                    return true;
                }
            );
        });

        it('with custom offset/line/column', () => {
            assert.throws(
                () => parse(
                    '#.classname\n\n\n',
                    { context: 'selector', positions: true, offset: 10, line: 10, column: 10 }
                ),
                (e) => {
                    assert.strictEqual(e.formattedMessage,
                        'Parse error: Name is expected\n' +
                        '   10 |         #.classname\n' +
                        '-----------------^'
                    );
                    assert.deepStrictEqual({
                        source: '#.classname\n\n\n',
                        offset: 11,
                        line: 10,
                        column: 11
                    }, {
                        source: e.source,
                        offset: e.offset,
                        line: e.line,
                        column: e.column
                    });

                    return true;
                }
            );
        });
    });

    describe('onComment', () => {
        const source = '/*123*/.foo[a=/* 234 */] {\n  color: red; /* 345*/\n  background: url(/*456*/foo);\n} /*567*';

        it('with no locations', () => {
            const actual = [];
            parse(source, {
                onComment(value, loc) {
                    actual.push({ value, loc });
                }
            });

            assert.deepStrictEqual(actual, [
                { value: '123', loc: null },
                { value: ' 234 ', loc: null },
                { value: ' 345', loc: null },
                { value: '567*', loc: null }
            ]);
        });

        it('with locations', () => {
            const actual = [];
            const offsetToPos = offset => {
                const lines = source.slice(0, offset).split('\n');
                return {
                    offset,
                    line: lines.length,
                    column: lines.pop().length + 1
                };
            };
            const loc = (start, end) => {
                return {
                    source: 'test.css',
                    start: offsetToPos(start),
                    end: offsetToPos(end)
                };
            };

            parse(source, {
                filename: 'test.css',
                positions: true,
                onComment(value, loc) {
                    actual.push({ value, loc });
                }
            });

            assert.deepStrictEqual(actual, [
                { value: '123', loc: loc(0, 7) },
                { value: ' 234 ', loc: loc(14, 23) },
                { value: ' 345', loc: loc(41, 49) },
                { value: '567*', loc: loc(83, 89) }
            ]);
        });
    });

    describe('onToken', () => {
        const source = 'a[b] {\n  color: rgb(1, 2);\n}';
        const tokenizeSource = css => {
            const tokens = [];
            tokenize(css, (type, start, end) => tokens.push({ type, start, end }));
            return tokens;
        };

        it('array: collects tokens in order', () => {
            const onToken = [];
            parse(source, { onToken });

            assert.deepStrictEqual(onToken, tokenizeSource(source));
        });

        it('array: appends to an existing array', () => {
            const onToken = [{ marker: true }];
            parse('a{}', { onToken });

            assert.strictEqual(onToken[0].marker, true);
            assert.strictEqual(onToken.length, 1 + tokenizeSource('a{}').length);
            assert.deepStrictEqual(
                onToken.slice(1).map(t => Object.keys(t).sort()),
                onToken.slice(1).map(() => ['end', 'start', 'type'])
            );
        });

        it('function: called per token with (type, start, end, index) in order', () => {
            const actual = [];
            parse(source, {
                onToken(type, start, end, index) {
                    actual.push({ type, start, end, index });
                }
            });

            assert.deepStrictEqual(
                actual,
                tokenizeSource(source).map((token, index) => ({ ...token, index }))
            );
        });

        it('function: this is a query object with source info', () => {
            parse(source, {
                filename: 'test.css',
                onToken() {
                    assert.strictEqual(this.tokenCount, tokenizeSource(source).length);
                    assert.strictEqual(this.filename, 'test.css');
                    assert.strictEqual(this.source, source);
                }
            });
        });

        it('query: getTokenType/getTokenName/getTokenStart/getTokenEnd/getTokenValue', () => {
            const css = 'abc {';
            parse(css, {
                onToken(type, start, end, index) {
                    assert.strictEqual(this.getTokenType(index), type);
                    assert.strictEqual(this.getTokenName(index), tokenNames[type]);
                    assert.strictEqual(this.getTokenStart(index), start);
                    assert.strictEqual(this.getTokenEnd(index), end);
                    assert.strictEqual(this.getTokenValue(index), css.substring(start, end));
                }
            });
        });

        it('query: getTokenValue/substring', () => {
            parse('.foo { color: red; }', {
                onToken(type, start, end, index) {
                    assert.strictEqual(this.getTokenValue(index), this.substring(start, end));
                }
            });
        });

        it('query: isBlockOpenerType/isBlockCloserType', () => {
            parse('a([{', {
                onToken() {
                    assert.strictEqual(this.isBlockOpenerType(tokenTypes.Function), true);
                    assert.strictEqual(this.isBlockOpenerType(tokenTypes.LeftParenthesis), true);
                    assert.strictEqual(this.isBlockOpenerType(tokenTypes.LeftSquareBracket), true);
                    assert.strictEqual(this.isBlockOpenerType(tokenTypes.LeftCurlyBracket), true);
                    assert.strictEqual(this.isBlockCloserType(tokenTypes.RightParenthesis), true);
                    assert.strictEqual(this.isBlockCloserType(tokenTypes.RightSquareBracket), true);
                    assert.strictEqual(this.isBlockCloserType(tokenTypes.RightCurlyBracket), true);
                    assert.strictEqual(this.isBlockOpenerType(tokenTypes.Ident), false);
                    assert.strictEqual(this.isBlockCloserType(tokenTypes.Ident), false);
                }
            });
        });

        it('query: getBalancePair for matched pairs both ways', () => {
            const bracketTypes = new Set([
                tokenTypes.Function,
                tokenTypes.LeftParenthesis,
                tokenTypes.RightParenthesis,
                tokenTypes.LeftSquareBracket,
                tokenTypes.RightSquareBracket,
                tokenTypes.LeftCurlyBracket,
                tokenTypes.RightCurlyBracket
            ]);
            const paired = new Map([
                [tokenTypes.Function, tokenTypes.RightParenthesis],
                [tokenTypes.LeftParenthesis, tokenTypes.RightParenthesis],
                [tokenTypes.LeftSquareBracket, tokenTypes.RightSquareBracket],
                [tokenTypes.LeftCurlyBracket, tokenTypes.RightCurlyBracket]
            ]);
            parse('a { color: rgb(1, [2]); }', {
                onToken(type, start, end, index) {
                    if (!bracketTypes.has(type)) {
                        return;
                    }

                    const pair = this.getBalancePair(index);
                    assert.notStrictEqual(pair, -1);
                    assert.strictEqual(this.getBalancePair(pair), index);

                    if (this.isBlockOpenerType(type)) {
                        assert.strictEqual(this.getTokenType(pair), paired.get(type));
                    } else {
                        const openerType = this.getTokenType(pair);
                        assert.strictEqual(paired.get(openerType), type);
                    }
                }
            });
        });

        it('query: getBalancePair for broken input returns -1 and never throws', () => {
            const cases = ['a {', 'rgb(', ')}', 'a { color: red'];
            const checks = query => {
                for (let i = -1; i <= query.tokenCount; i++) {
                    const pair = query.getBalancePair(i);
                    assert.ok(pair === -1 || (pair >= 0 && pair < query.tokenCount));
                    if (pair !== -1) {
                        assert.strictEqual(query.getBalancePair(pair), i);
                    }
                }
            };

            for (const css of cases) {
                parse(css, {
                    onToken() {
                        checks(this);
                    }
                });
            }
        });

        it('query: full token stream is available from the first callback', () => {
            parse(source, {
                onToken(type, start, end, index) {
                    if (index === 0) {
                        const last = this.tokenCount - 1;
                        assert.strictEqual(this.getTokenType(last), tokenTypes.RightCurlyBracket);
                        assert.strictEqual(this.getTokenStart(last), source.lastIndexOf('}'));
                        assert.strictEqual(this.getBalancePair(index), -1);
                    }
                }
            });
        });

        it('query: getLocation/getLocationRange align with AST node loc', () => {
            const css = '.a {\n  color: red;\n}';
            const tokenLocs = [];
            const ast = parse(css, {
                positions: true,
                filename: 'test.css',
                onToken(type, start, end) {
                    tokenLocs.push({
                        start: this.getLocation(start, 'test.css'),
                        range: this.getLocationRange(start, end, 'test.css')
                    });
                }
            });

            const block = ast.children.first.block;
            const curly = tokenLocs.find(loc =>
                loc.range.start.offset === block.loc.start.offset &&
                loc.range.end.offset === block.loc.start.offset + 1
            );
            assert.ok(curly);
            for (const point of [curly.start, curly.range.start]) {
                assert.strictEqual(point.offset, block.loc.start.offset);
                assert.strictEqual(point.line, block.loc.start.line);
                assert.strictEqual(point.column, block.loc.start.column);
            }
            assert.strictEqual(curly.start.source, 'test.css');
            assert.strictEqual(curly.range.source, 'test.css');
        });

        it('query: getLocation honors offset/line/column options', () => {
            const css = 'a{\n b:c;\n}';
            parse(css, {
                positions: true,
                offset: 100,
                line: 10,
                column: 5,
                onToken(type, start, end, index) {
                    const loc = this.getLocation(start);
                    assert.strictEqual(loc.offset, start + 100);
                    if (index === 0) {
                        assert.strictEqual(loc.line, 10);
                        assert.strictEqual(loc.column, 5);
                    }
                    // single-point call and interval call agree at the start
                    const rangeStart = this.getLocationRange(start, start).start;
                    assert.strictEqual(rangeStart.offset, loc.offset);
                    assert.strictEqual(rangeStart.line, loc.line);
                    assert.strictEqual(rangeStart.column, loc.column);
                }
            });
        });

        it('works together with onComment, AST stays identical', () => {
            const css = '/*c*/ .a[x=y] { color: rgb(1,2); /*d*/ }';
            const events = [];
            const plain = parse(css);
            const ast = parse(css, {
                onToken(type) {
                    events.push(type === tokenTypes.Comment ? 'T-comment' : 'T');
                },
                onComment(value) {
                    events.push('C' + value);
                }
            });

            assert.deepStrictEqual(JSON.parse(JSON.stringify(ast)), JSON.parse(JSON.stringify(plain)));
            // both callbacks fire for each comment token, onToken first
            assert.deepStrictEqual(events.filter(e => e.startsWith('C') || e === 'T-comment'), [
                'T-comment', 'Cc',
                'T-comment', 'Cd'
            ]);
        });

        it('AST identical when enabled and when omitted (with and without positions)', () => {
            const css = 'a { x: fn(1 2), "s" /*c*/ url(u); }';
            for (const positions of [false, true]) {
                const a = JSON.stringify(parse(css, { positions }));
                const b = JSON.stringify(parse(css, { positions, onToken() {} }));
                const c = JSON.stringify(parse(css, { positions, onToken: [] }));
                assert.strictEqual(b, a);
                assert.strictEqual(c, a);
            }
        });

        it('does not affect other parse options', () => {
            const css = '@media screen { a { x: 1 } }';
            const options = {
                parseAtrulePrelude: false,
                parseRulePrelude: false,
                parseValue: false,
                parseCustomProperty: true,
                onToken() {}
            };
            const plain = JSON.parse(JSON.stringify(parse(css, {
                parseAtrulePrelude: false,
                parseRulePrelude: false,
                parseValue: false,
                parseCustomProperty: true
            })));
            assert.deepStrictEqual(JSON.parse(JSON.stringify(parse(css, options))), plain);
        });

        it('non-function/non-array onToken is ignored', () => {
            assert.doesNotThrow(() => parse('a{}', { onToken: null }));
            assert.doesNotThrow(() => parse('a{}', { onToken: 42 }));
        });
    });

    describe('positions', () => {
        it('should start with line 1 column 1 by default', () => {
            const positions = [];
            const ast = parse('.foo.bar {\n  property: value 123 123.4 .123 123px 99% #fff url( a ) / var( --a ), "test" \'test\';\n}', {
                positions: true
            });

            walk(ast, node => {
                if (node.loc) {
                    positions.push([
                        node.loc.start.offset,
                        node.loc.start.line,
                        node.loc.start.column,
                        node.type
                    ]);
                }
            });

            assert.deepStrictEqual(positions, [
                [0, 1, 1, 'StyleSheet'],
                [0, 1, 1, 'Rule'],
                [0, 1, 1, 'SelectorList'],
                [0, 1, 1, 'Selector'],
                [0, 1, 1, 'ClassSelector'],
                [4, 1, 5, 'ClassSelector'],
                [9, 1, 10, 'Block'],
                [13, 2, 3, 'Declaration'],
                [23, 2, 13, 'Value'],
                [23, 2, 13, 'Identifier'],
                [29, 2, 19, 'Number'],
                [33, 2, 23, 'Number'],
                [39, 2, 29, 'Number'],
                [44, 2, 34, 'Dimension'],
                [50, 2, 40, 'Percentage'],
                [54, 2, 44, 'Hash'],
                [59, 2, 49, 'Url'],
                [68, 2, 58, 'Operator'],
                [70, 2, 60, 'Function'],
                [75, 2, 65, 'Identifier'],
                [80, 2, 70, 'Operator'],
                [82, 2, 72, 'String'],
                [89, 2, 79, 'String']
            ]);
        });

        it('should start with specified offset, line and column', () => {
            const positions = [];
            const ast = parse('.foo.bar {\n  property: value 123 123.4 .123 123px 99% #fff url( a ) / var( --a ), "test" \'test\';\n}', {
                positions: true,
                offset: 100,
                line: 3,
                column: 5
            });

            walk(ast, node => {
                if (node.loc) {
                    positions.push([
                        node.loc.start.offset,
                        node.loc.start.line,
                        node.loc.start.column,
                        node.type
                    ]);
                }
            });

            assert.deepStrictEqual(positions, [
                [100, 3, 5, 'StyleSheet'],
                [100, 3, 5, 'Rule'],
                [100, 3, 5, 'SelectorList'],
                [100, 3, 5, 'Selector'],
                [100, 3, 5, 'ClassSelector'],
                [104, 3, 9, 'ClassSelector'],
                [109, 3, 14, 'Block'],
                [113, 4, 3, 'Declaration'],
                [123, 4, 13, 'Value'],
                [123, 4, 13, 'Identifier'],
                [129, 4, 19, 'Number'],
                [133, 4, 23, 'Number'],
                [139, 4, 29, 'Number'],
                [144, 4, 34, 'Dimension'],
                [150, 4, 40, 'Percentage'],
                [154, 4, 44, 'Hash'],
                [159, 4, 49, 'Url'],
                [168, 4, 58, 'Operator'],
                [170, 4, 60, 'Function'],
                [175, 4, 65, 'Identifier'],
                [180, 4, 70, 'Operator'],
                [182, 4, 72, 'String'],
                [189, 4, 79, 'String']
            ]);
        });
    });
});
