import assert from 'assert';
import {
    parse,
    tokenTypes,
    tokenNames,
    TokenStream,
    tokenize,
    walk
} from 'css-tree';

const css = '.foo {\n  color: rgb(1, 2);\n}';

function expectedTokens(source) {
    const tokens = [];

    tokenize(source, (type, start, end) =>
        tokens.push({ type, start, end })
    );

    return tokens;
}

describe('onToken', () => {
    it('array: collects { type, start, end } in source order', () => {
        const tokens = [];

        parse(css, { onToken: tokens });

        assert.deepStrictEqual(tokens, expectedTokens(css));
        assert(tokens.every(token =>
            typeof token.type === 'number' &&
            typeof token.start === 'number' &&
            typeof token.end === 'number'
        ));
    });

    it('array: type values are tokenizer numeric types', () => {
        const tokens = [];

        parse(css, { onToken: tokens });

        assert(tokens.every(token => token.type >= 0 && token.type < tokenNames.length));
        assert.strictEqual(tokens[0].type, tokenTypes.Delim);
        assert.strictEqual(tokens[tokens.length - 1].type, tokenTypes.RightCurlyBracket);
    });

    it('array: tokens slice back to the source', () => {
        const tokens = [];

        parse(css, { onToken: tokens });

        assert.strictEqual(
            tokens.map(t => css.slice(t.start, t.end)).join(''),
            css
        );
    });

    it('function: invoked for each token with (type, start, end, index)', () => {
        const expected = expectedTokens(css);
        const actual = [];
        const indices = [];

        parse(css, {
            onToken(type, start, end, index) {
                actual.push({ type, start, end });
                indices.push(index);
            }
        });

        assert.deepStrictEqual(actual, expected);
        assert.deepStrictEqual(indices, expected.map((_, i) => i));
    });

    it('function: tokens delivered even when parsing fails afterwards', () => {
        // "{" can't be parsed as a value, but tokenization completes before parsing
        const source = '{';
        const actual = [];

        assert.throws(() => parse(source, {
            context: 'value',
            onToken(type, start, end, index) {
                actual.push({ type, start, end, index });
            }
        }));

        assert.deepStrictEqual(
            actual.map(({ type, start, end }) => ({ type, start, end })),
            expectedTokens(source)
        );
        assert.deepStrictEqual(actual.map(t => t.index), expectedTokens(source).map((_, i) => i));
    });

    it('other option types (null, string, number) are ignored', () => {
        assert.doesNotThrow(() => parse(css, { onToken: null }));
        assert.doesNotThrow(() => parse(css, { onToken: {} }));
        assert.doesNotThrow(() => parse(css, { onToken: 1 }));
    });

    describe('query object (callback `this`)', () => {
        it('tokenCount matches the number of delivered tokens', () => {
            let count = -1;
            let total = -1;

            parse(css, {
                onToken() {
                    if (count === -1) {
                        count = this.tokenCount;
                        total = 0;
                    }
                    total++;
                }
            });

            assert.strictEqual(total, count);
            assert(count > 0);
        });

        it('source and filename expose the parse options', () => {
            parse(css, {
                filename: 'component.vue',
                onToken() {
                    assert.strictEqual(this.source, css);
                    assert.strictEqual(this.filename, 'component.vue');
                }
            });
        });

        it('filename defaults to <unknown>', () => {
            parse(css, {
                onToken() {
                    assert.strictEqual(this.filename, '<unknown>');
                }
            });
        });

        it('getTokenType(index) returns tokenizer numeric types', () => {
            parse(css, {
                onToken(type, start, end, index) {
                    assert.strictEqual(this.getTokenType(index), type);
                }
            });
        });

        it('getTokenTypeName(index) returns tokenizer type names', () => {
            parse(css, {
                onToken(type, start, end, index) {
                    assert.strictEqual(this.getTokenTypeName(index), tokenNames[type]);
                }
            });
        });

        it('getTokenStart/getTokenEnd(index) match callback offsets', () => {
            parse(css, {
                onToken(type, start, end, index) {
                    assert.strictEqual(this.getTokenStart(index), start);
                    assert.strictEqual(this.getTokenEnd(index), end);
                }
            });
        });

        it('getTokenValue(index) returns the token source text', () => {
            parse(css, {
                onToken(type, start, end, index) {
                    assert.strictEqual(this.getTokenValue(index), css.slice(start, end));
                }
            });
        });

        it('substring(start, end) returns source fragment', () => {
            parse(css, {
                onToken() {
                    assert.strictEqual(this.substring(0, 4), css.substring(0, 4));
                }
            });
        });

        it('indices/types/offsets are identical to the ones used internally', () => {
            const fromCallback = [];

            parse(css, {
                onToken(type, start, end, index) {
                    fromCallback.push([index, type, start, end]);
                }
            });

            const stream = new TokenStream(css, tokenize);

            assert.strictEqual(fromCallback.length, stream.tokenCount);
            for (const [index, type, start, end] of fromCallback) {
                assert.strictEqual(stream.getTokenType(index), type);
                assert.strictEqual(stream.getTokenStart(index), start);
                assert.strictEqual(stream.getTokenEnd(index), end);
            }
        });

        it('any index, including future tokens, is queryable from every callback', () => {
            const expected = expectedTokens(css);

            parse(css, {
                onToken() {
                    // query past the current parse/callback position
                    for (let i = 0; i < expected.length; i++) {
                        assert.strictEqual(this.getTokenType(i), expected[i].type);
                        assert.strictEqual(this.getTokenStart(i), expected[i].start);
                        assert.strictEqual(this.getTokenEnd(i), expected[i].end);
                    }
                }
            });
        });

        it('out-of-range indices return EOF / safe offsets and never throw', () => {
            parse(css, {
                onToken() {
                    const count = this.tokenCount;

                    assert.strictEqual(this.getTokenType(-1), tokenTypes.EOF);
                    assert.strictEqual(this.getTokenType(count), tokenTypes.EOF);
                    assert.strictEqual(this.getTokenType(count + 100), tokenTypes.EOF);
                    assert.strictEqual(this.getTokenValue(-1), '');
                    assert.strictEqual(this.getTokenValue(count), '');
                    assert.strictEqual(this.getTokenPair(-1), -1);
                    assert.strictEqual(this.getTokenPair(count), -1);
                }
            });
        });

        describe('isBlockOpenerType / isBlockCloserType', () => {
            it('opener types', () => {
                parse(css, {
                    onToken() {
                        assert.strictEqual(this.isBlockOpenerType(tokenTypes.Function), true);
                        assert.strictEqual(this.isBlockOpenerType(tokenTypes.LeftParenthesis), true);
                        assert.strictEqual(this.isBlockOpenerType(tokenTypes.LeftSquareBracket), true);
                        assert.strictEqual(this.isBlockOpenerType(tokenTypes.LeftCurlyBracket), true);
                        assert.strictEqual(this.isBlockOpenerType(tokenTypes.Ident), false);
                        assert.strictEqual(this.isBlockOpenerType(tokenTypes.RightParenthesis), false);
                    }
                });
            });

            it('closer types', () => {
                parse(css, {
                    onToken() {
                        assert.strictEqual(this.isBlockCloserType(tokenTypes.RightParenthesis), true);
                        assert.strictEqual(this.isBlockCloserType(tokenTypes.RightSquareBracket), true);
                        assert.strictEqual(this.isBlockCloserType(tokenTypes.RightCurlyBracket), true);
                        assert.strictEqual(this.isBlockCloserType(tokenTypes.LeftParenthesis), false);
                        assert.strictEqual(this.isBlockCloserType(tokenTypes.Ident), false);
                    }
                });
            });
        });

        describe('getTokenPair', () => {
            const findTokens = (query, pred) => {
                const result = [];
                for (let i = 0; i < query.tokenCount; i++) {
                    if (pred(query.getTokenType(i), query.getTokenValue(i))) {
                        result.push(i);
                    }
                }
                return result;
            };

            it('paired ends find each other', () => {
                parse(css, {
                    onToken() {
                        const q = this;
                        const checks = [
                            [tokenTypes.Function, v => v === 'rgb('],
                            [tokenTypes.LeftCurlyBracket, v => v === '{'],
                            [tokenTypes.RightParenthesis, v => v === ')'],
                            [tokenTypes.RightCurlyBracket, v => v === '}']
                        ];

                        for (const [type, byValue] of checks) {
                            const [index] = findTokens(q, (t, v) => t === type && byValue(v));

                            assert.notStrictEqual(index, undefined);
                            const pair = q.getTokenPair(index);

                            assert.notStrictEqual(pair, -1);
                            assert.strictEqual(q.getTokenPair(pair), index);
                            assert.notStrictEqual(q.getTokenType(pair), type);
                        }
                    }
                });
            });

            // For each broken source, the indices (ignoring whitespace) that
            // must resolve to -1; counting non-whitespace tokens from 0.
            const countNonWS = query => {
                let n = 0;
                for (let i = 0; i < query.tokenCount; i++) {
                    if (query.getTokenType(i) !== tokenTypes.WhiteSpace) {
                        n++;
                    }
                }
                return n;
            };
            const nthNonWS = (query, n) => {
                let seen = -1;
                for (let i = 0; i < query.tokenCount; i++) {
                    if (query.getTokenType(i) !== tokenTypes.WhiteSpace && ++seen === n) {
                        return i;
                    }
                }
                return -1;
            };

            [
                // [name, source, context, non-whitespace token positions that are unpaired]
                ['unclosed block', 'a { color: red;', 'declarationList', q => [nthNonWS(q, 1)]],
                ['unclosed function', 'rgb(1, 2', 'declarationList', () => [0]],
                ['unclosed parenthesis', 'a:(1', 'declarationList', q => [nthNonWS(q, 2)]],
                ['stray closing bracket', 'a { color: red; } )', 'default', q => [nthNonWS(q, countNonWS(q) - 1)]],
                ['stray closing curly bracket', 'a {} }', 'default', q => [nthNonWS(q, countNonWS(q) - 1)]],
                ['mismatched nesting', '( { )', 'default', q => [0, 1, 2].map(n => nthNonWS(q, n))],
                // in "[ ) ]" the brackets enclose a stray ")", which is simply
                // content, so [ ] stay paired and only the ")" is unpaired
                ['mismatched nesting types', '[ ) ]', 'default', q => [nthNonWS(q, 1)]]
            ].forEach(([name, source, context, pickUnpaired]) => {
                it(`${name}: returns -1, never a wrong-typed token`, () => {
                    parse(source, {
                        context,
                        onParseError() {},
                        onToken() {
                            const q = this;

                            // every pair reported must be symmetric
                            for (let i = 0; i < q.tokenCount; i++) {
                                const pair = q.getTokenPair(i);

                                if (pair !== -1) {
                                    assert.strictEqual(q.getTokenPair(pair), i);
                                    assert.notStrictEqual(pair, i);
                                }
                            }

                            // the designated broken tokens resolve to -1
                            for (const index of pickUnpaired(q)) {
                                assert.strictEqual(q.getTokenPair(index), -1,
                                    `${q.getTokenValue(index)} at ${index} must be unpaired`);
                            }

                            // sanity: 'a {} }' keeps the first braces paired,
                            // the stray closer unpaired
                            if (name === 'stray closing curly bracket') {
                                const opener = nthNonWS(q, 1);
                                const closer = nthNonWS(q, 2);
                                assert.strictEqual(q.getTokenPair(opener), closer);
                                assert.strictEqual(q.getTokenPair(closer), opener);
                            }
                        }
                    });
                });
            });
        });

        describe('locations', () => {
            const multiline = 'a {\n  color: red;\n}';

            it('getLocation/getLocationRange default offset/line/column', () => {
                parse(multiline, {
                    onToken() {
                        assert.deepStrictEqual(this.getLocation(0), {
                            source: '<unknown>',
                            offset: 0,
                            line: 1,
                            column: 1
                        });
                        assert.deepStrictEqual(this.getLocationRange(0, 1), {
                            source: '<unknown>',
                            start: { offset: 0, line: 1, column: 1 },
                            end: { offset: 1, line: 1, column: 2 }
                        });
                    }
                });
            });

            it('honours offset/line/column options (Vue SFC style block)', () => {
                const offset = 200;
                const line = 42;
                const column = 7;

                parse(multiline, {
                    positions: true,
                    offset,
                    line,
                    column,
                    filename: 'component.vue',
                    onToken() {
                        assert.deepStrictEqual(this.getLocation(0), {
                            source: 'component.vue',
                            offset,
                            line,
                            column
                        });
                        // offset 6 is "c" of "color" on the second source line
                        assert.deepStrictEqual(this.getLocation(6), {
                            source: 'component.vue',
                            offset: offset + 6,
                            line: line + 1,
                            column: 3
                        });
                    }
                });
            });

            it('locations match AST node locs within the same parse', () => {
                const options = {
                    positions: true,
                    offset: 50,
                    line: 10,
                    column: 3,
                    filename: 'component.vue',
                    onToken() {}
                };
                const ast = parse(multiline, options);

                let rule;
                walk(ast, node => {
                    if (node.type === 'Rule') {
                        rule = node;
                    }
                });

                // Same options ⇒ querying the same offsets must produce
                // the very same line/column data the parser puts on node locs.
                parse(multiline, {
                    ...options,
                    onToken() {
                        const preludeLoc = rule.prelude.loc;
                        const queryRange = this.getLocationRange(
                            preludeLoc.start.offset - 50,
                            preludeLoc.end.offset - 50
                        );

                        assert.strictEqual(queryRange.source, 'component.vue');
                        assert.deepStrictEqual(queryRange.start, preludeLoc.start);
                        assert.deepStrictEqual(queryRange.end, preludeLoc.end);

                        const blockStart = rule.block.loc.start;
                        const blockPoint = this.getLocation(blockStart.offset - 50);
                        assert.strictEqual(blockPoint.offset, blockStart.offset);
                        assert.strictEqual(blockPoint.line, blockStart.line);
                        assert.strictEqual(blockPoint.column, blockStart.column);
                        assert.strictEqual(blockPoint.source, 'component.vue');
                    }
                });
            });
        });
    });

    it('works together with onComment', () => {
        const source = '/* a */ .foo { /* b */ color: red; }';
        const tokens = [];
        const comments = [];

        const astWith = parse(source, {
            positions: true,
            onToken: tokens,
            onComment(value, loc) {
                comments.push({ value, loc: loc ? 'loc' : null });
            }
        });
        const astWithout = parse(source, { positions: true });

        assert.deepStrictEqual(
            JSON.stringify(astWith),
            JSON.stringify(astWithout)
        );
        assert.deepStrictEqual(comments, [{ value: ' a ', loc: 'loc' }, { value: ' b ', loc: 'loc' }]);
        assert(tokens.some(t => t.type === tokenTypes.Comment));
        assert.deepStrictEqual(tokens, expectedTokens(source));
    });

    it('does not change the AST compared to a parse without onToken', () => {
        const sources = [
            css,
            '@media screen { a { color: red } } b { margin: 0 !important }',
            '/* x */ .a, .b:hover > .c { content: "}"; }',
            ''
        ];

        for (const source of sources) {
            const plain = parse(source, { positions: true });
            const tokens = [];
            const withTokens = parse(source, {
                positions: true,
                onToken: tokens,
                onComment() {}
            });

            assert.deepStrictEqual(withTokens, plain);
            assert.deepStrictEqual(tokens, expectedTokens(source));
        }
    });

    it('works on the selector parser', async () => {
        const { default: parseSelector } = await import('css-tree/selector-parser');
        const tokens = [];

        parseSelector('a, b:hover( x )', { onToken: tokens });

        assert.deepStrictEqual(tokens, expectedTokens('a, b:hover( x )'));
    });

    it('other options still take effect (parseAtrulePrelude: false)', () => {
        const tokens = [];

        const ast = parse('@media screen { a {} }', {
            parseAtrulePrelude: false,
            onToken: tokens
        });

        assert.strictEqual(ast.children.first.type, 'Atrule');
        assert.strictEqual(ast.children.first.prelude.type, 'Raw');
        assert(tokens.length > 0);
    });
});

describe('TokenStream public API', () => {
    const createStream = source => new TokenStream(source, tokenize);

    describe('getTokenType', () => {
        it('returns numeric type by index', () => {
            const stream = createStream(css);

            for (let i = 0; i < stream.tokenCount; i++) {
                assert.strictEqual(typeof stream.getTokenType(i), 'number');
            }
        });

        it('returns EOF out of range', () => {
            const stream = createStream(css);

            assert.strictEqual(stream.getTokenType(-1), tokenTypes.EOF);
            assert.strictEqual(stream.getTokenType(stream.tokenCount), tokenTypes.EOF);
            assert.strictEqual(stream.getTokenType(1e9), tokenTypes.EOF);
        });

        it('empty source', () => {
            const stream = createStream('');

            assert.strictEqual(stream.tokenCount, 0);
            assert.strictEqual(stream.getTokenType(0), tokenTypes.EOF);
        });
    });

    describe('getTokenStart / getTokenEnd', () => {
        it('slices cover the source token by token', () => {
            const stream = createStream(css);
            let joined = '';

            for (let i = 0; i < stream.tokenCount; i++) {
                const start = stream.getTokenStart(i);
                const end = stream.getTokenEnd(i);

                assert(end >= start);
                joined += css.slice(start, end);
            }

            assert.strictEqual(joined, css);
        });

        it('out of range end resolves to source length', () => {
            const stream = createStream(css);

            assert.strictEqual(stream.getTokenEnd(stream.tokenCount), css.length);
            assert.strictEqual(stream.getTokenEnd(stream.tokenCount + 10), css.length);
        });
    });

    describe('isBlockOpenerType / isBlockCloserType', () => {
        it('openers', () => {
            const stream = createStream(css);

            assert.strictEqual(stream.isBlockOpenerType(tokenTypes.Function), true);
            assert.strictEqual(stream.isBlockOpenerType(tokenTypes.LeftParenthesis), true);
            assert.strictEqual(stream.isBlockOpenerType(tokenTypes.LeftSquareBracket), true);
            assert.strictEqual(stream.isBlockOpenerType(tokenTypes.LeftCurlyBracket), true);
            assert.strictEqual(stream.isBlockOpenerType(tokenTypes.RightParenthesis), false);
            assert.strictEqual(stream.isBlockOpenerType(tokenTypes.Ident), false);
        });

        it('closers', () => {
            const stream = createStream(css);

            assert.strictEqual(stream.isBlockCloserType(tokenTypes.RightParenthesis), true);
            assert.strictEqual(stream.isBlockCloserType(tokenTypes.RightSquareBracket), true);
            assert.strictEqual(stream.isBlockCloserType(tokenTypes.RightCurlyBracket), true);
            assert.strictEqual(stream.isBlockCloserType(tokenTypes.LeftParenthesis), false);
        });
    });

    describe('getTokenPair', () => {
        const pairsOf = source => {
            const stream = createStream(source);
            const pairs = [];

            for (let i = 0; i < stream.tokenCount; i++) {
                pairs.push(stream.getTokenPair(i));
            }

            return { stream, pairs };
        };

        it('returns -1 out of range', () => {
            const stream = createStream(css);

            assert.strictEqual(stream.getTokenPair(-1), -1);
            assert.strictEqual(stream.getTokenPair(stream.tokenCount), -1);
        });

        it('matched pairs are symmetric for (), [], {} and function()', () => {
            const { stream, pairs } = pairsOf('a { color: rgb(1, [2], 3); }');

            for (let i = 0; i < stream.tokenCount; i++) {
                const pair = pairs[i];

                if (pair !== -1) {
                    assert.strictEqual(stream.getTokenPair(pair), i);
                    assert.strictEqual(pairs[pair], i);
                }
            }

            // every opener/closer in this balanced source is paired
            let edgeCount = 0;
            for (let i = 0; i < stream.tokenCount; i++) {
                const type = stream.getTokenType(i);
                if (stream.isBlockOpenerType(type) || stream.isBlockCloserType(type)) {
                    edgeCount++;
                    assert.notStrictEqual(pairs[i], -1);
                }
            }
            assert(edgeCount >= 6);
        });

        it('url token is not a block opener and stays unpaired', () => {
            const { stream, pairs } = pairsOf('background: url(foo)');

            for (let i = 0; i < stream.tokenCount; i++) {
                if (stream.getTokenType(i) === tokenTypes.Url) {
                    assert.strictEqual(pairs[i], -1);
                }
            }
        });

        const invalidCases = [
            'a {',                       // unclosed block
            'rgb(',                      // unclosed function
            'rgb(1, 2',                  // unclosed function with content
            'a:(1',                      // unclosed parenthesis
            'a { } )',                   // extra closing parenthesis
            'a {} }',                    // extra closing curly bracket
            'a [x] ]',                   // extra closing square bracket
            ')(',                        // stray closer before opener
            '( { )',                     // cross nesting: inner never closes
            '{ ( } )',                   // cross nesting: mixed
            '[ )',                       // wrong closer type
            '((()))',                    // nested balanced sanity
            ''
        ];

        invalidCases.forEach(source => {
            it(`deterministic & never wrong-typed: ${JSON.stringify(source)}`, () => {
                const { stream, pairs } = pairsOf(source);

                for (let i = 0; i < stream.tokenCount; i++) {
                    const pair = pairs[i];

                    assert.ok(pair === -1 || (pair >= 0 && pair < stream.tokenCount));

                    if (pair !== -1) {
                        // symmetry and type compatibility
                        assert.strictEqual(pairs[pair], i);

                        const type = stream.getTokenType(i);
                        const pairType = stream.getTokenType(pair);
                        const compatible =
                            (type === tokenTypes.RightParenthesis &&
                                (pairType === tokenTypes.LeftParenthesis || pairType === tokenTypes.Function)) ||
                            (pairType === tokenTypes.RightParenthesis &&
                                (type === tokenTypes.LeftParenthesis || type === tokenTypes.Function)) ||
                            (type === tokenTypes.LeftSquareBracket && pairType === tokenTypes.RightSquareBracket) ||
                            (type === tokenTypes.RightSquareBracket && pairType === tokenTypes.LeftSquareBracket) ||
                            (type === tokenTypes.LeftCurlyBracket && pairType === tokenTypes.RightCurlyBracket) ||
                            (type === tokenTypes.RightCurlyBracket && pairType === tokenTypes.LeftCurlyBracket);

                        assert(compatible, `types ${tokenNames[type]} and ${tokenNames[pairType]} can't be a pair`);
                    }
                }
            });
        });

        it('specific expectations on broken inputs', () => {
            // the stray closing "}" (last token of "a {} }") is unpaired, while
            // the matched "{ }" pair still resolves from both ends
            const source = 'a {} }';
            const stream = createStream(source);
            const curly = [];

            for (let i = 0; i < stream.tokenCount; i++) {
                const type = stream.getTokenType(i);
                if (type === tokenTypes.LeftCurlyBracket ||
                    type === tokenTypes.RightCurlyBracket) {
                    curly.push(i);
                }
            }

            assert.strictEqual(source.slice(stream.getTokenStart(curly[2]), stream.getTokenEnd(curly[2])), '}');
            assert.deepStrictEqual(curly.length, 3);
            assert.strictEqual(stream.getTokenPair(curly[0]), curly[1]);
            assert.strictEqual(stream.getTokenPair(curly[1]), curly[0]);
            assert.strictEqual(stream.getTokenPair(curly[2]), -1);
        });
    });
});
