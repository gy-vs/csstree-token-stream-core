import assert from 'assert';
import { TokenStream, tokenize, tokenNames, tokenTypes } from 'css-tree';
import * as fixture from './fixture/tokenize.js';

describe('tokenize/stream', () => {
    const createStream = source => new TokenStream(source, tokenize);
    const css = '.test\n{\n  prop: url(foo/bar.jpg) url( a\\(\\33 \\).\\ \\"\\\'test ) calc(1 + 1) \\x \\aa ;\n}<!--<-->\\\n';
    const tokens = [
        { type: 'delim-token', chunk: '.', balance: 31 },
        { type: 'ident-token', chunk: 'test', balance: 31 },
        { type: 'whitespace-token', chunk: '\n', balance: 31 },
        { type: '{-token', chunk: '{', balance: 25 },
        { type: 'whitespace-token', chunk: '\n  ', balance: 25 },
        { type: 'ident-token', chunk: 'prop', balance: 25 },
        { type: 'colon-token', chunk: ':', balance: 25 },
        { type: 'whitespace-token', chunk: ' ', balance: 25 },
        { type: 'url-token', chunk: 'url(foo/bar.jpg)', balance: 25 },
        { type: 'whitespace-token', chunk: ' ', balance: 25 },
        { type: 'url-token', chunk: 'url( a\\(\\33 \\).\\ \\"\\\'test )', balance: 25 },
        { type: 'whitespace-token', chunk: ' ', balance: 25 },
        { type: 'function-token', chunk: 'calc(', balance: 18 },
        { type: 'number-token', chunk: '1', balance: 18 },
        { type: 'whitespace-token', chunk: ' ', balance: 18 },
        { type: 'delim-token', chunk: '+', balance: 18 },
        { type: 'whitespace-token', chunk: ' ', balance: 18 },
        { type: 'number-token', chunk: '1', balance: 18 },
        { type: ')-token', chunk: ')', balance: 12 },
        { type: 'whitespace-token', chunk: ' ', balance: 25 },
        { type: 'ident-token', chunk: '\\x', balance: 25 },
        { type: 'whitespace-token', chunk: ' ', balance: 25 },
        { type: 'ident-token', chunk: '\\aa ', balance: 25 },
        { type: 'semicolon-token', chunk: ';', balance: 25 },
        { type: 'whitespace-token', chunk: '\n', balance: 25 },
        { type: '}-token', chunk: '}', balance: 3 },
        { type: 'CDO-token', chunk: '<!--', balance: 31 },
        { type: 'delim-token', chunk: '<', balance: 31 },
        { type: 'CDC-token', chunk: '-->', balance: 31 },
        { type: 'delim-token', chunk: '\\', balance: 31 },
        { type: 'whitespace-token', chunk: '\n', balance: 31 }
    ];
    const dump = tokens.map(({ type, chunk, balance }, idx) => ({
        idx,
        type,
        chunk,
        balance
    }));
    const types = tokens.map(token => token.type);
    const start = tokens.map(function(token) {
        const start = this.offset;
        this.offset += token.chunk.length;
        return start;
    }, { offset: 0 });
    const end = tokens.map(function(token) {
        this.offset += token.chunk.length;
        return this.offset;
    }, { offset: 0 });

    it('edge case: no arguments', () => {
        const stream = createStream();

        assert.strictEqual(stream.eof, true);
        assert.strictEqual(stream.tokenType, 0);
        assert.strictEqual(stream.source, '');
    });

    it('edge case: empty input', () => {
        const stream = createStream('');

        assert.strictEqual(stream.eof, true);
        assert.strictEqual(stream.tokenType, 0);
        assert.strictEqual(stream.source, '');
    });

    it('should convert input to string', () => {
        const stream = createStream({
            toString() {
                return css;
            }
        });

        assert.strictEqual(stream.source, css);
    });

    it('should accept a Buffer', () => {
        const stream = createStream(Buffer.from(css));

        assert.strictEqual(stream.source, css);
    });

    it('dump()', () => {
        const stream = createStream(css);

        assert.deepStrictEqual(stream.dump(), dump);
    });

    it('next() types', () => {
        const stream = createStream(css);
        const actual = [];

        while (!stream.eof) {
            actual.push(tokenNames[stream.tokenType]);
            stream.next();
        }

        assert.deepStrictEqual(actual, types);
    });

    it('next() start', () => {
        const stream = createStream(css);
        const actual = [];

        while (!stream.eof) {
            actual.push(stream.tokenStart);
            stream.next();
        }

        assert.deepStrictEqual(actual, start);
    });

    it('next() end', () => {
        const stream = createStream(css);
        const actual = [];

        while (!stream.eof) {
            actual.push(stream.tokenEnd);
            stream.next();
        }

        assert.deepStrictEqual(actual, end);
    });

    it('skip()', () => {
        const stream = createStream(css);
        const targetTokens = tokens.filter(token =>
            token.type === 'ident-token' || token.type === 'delim-token'
        );
        const actual = targetTokens
            .map(function(token, idx, idents) {
                return idx ? tokens.indexOf(token) - tokens.indexOf(idents[idx - 1]) : tokens.indexOf(token);
            })
            .map(function(skip) {
                stream.skip(skip);
                return tokenNames[stream.tokenType];
            });

        assert.strictEqual(actual.length, 8); // 4 x Indentifier + 4 x delim-token
        assert.deepStrictEqual(actual, targetTokens.map(token => token.type));
    });

    it('skip() to end', () => {
        const stream = createStream(css);

        stream.skip(tokens.length);

        assert.strictEqual(stream.eof, true);
    });

    describe('Raw', () => {
        const LEFTCURLYBRACKET = 0x007B; // U+007B LEFT CURLY BRACKET ({)
        const SEMICOLON = 0x003B;        // U+003B SEMICOLON (;)
        const leftCurlyBracket = code => code === LEFTCURLYBRACKET ? 1 : 0;
        const semicolonIncluded = code => code === SEMICOLON ? 2 : 0;
        /* eslint-disable key-spacing */
        const tests = [
            {
                source: '? { }',
                start:  '^',
                skip:   '^',
                mode: leftCurlyBracket,
                expected: '? '
            },
            {
                // issues #56
                source: 'div { }',
                start:  '^',
                skip:   '^',
                mode: leftCurlyBracket,
                expected: 'div '
            },
            {
                source: 'foo(bar(1)(2)(3[{}])(4{}){}(5))',
                start:  '             ^',
                skip:   '             ^',
                mode: leftCurlyBracket,
                expected: '(3[{}])(4{})'
            },
            {
                source: 'foo(bar(1) (2) (3[{}]) (4{}) {} (5))',
                start:  '               ^',
                skip:   '                ^',
                mode: leftCurlyBracket,
                expected: '(3[{}]) (4{}) '
            },
            {
                source: 'func(a func(;))',
                start:  '     ^',
                skip:   '       ^',
                mode: semicolonIncluded,
                expected: 'a func(;)'
            },
            {
                source: 'func(a func(;))',
                start:  '     ^',
                skip:   '            ^',
                mode: semicolonIncluded,
                expected: 'a func(;)'
            },
            {
                source: 'func(a func(;); b)',
                start:  '     ^',
                skip:   '       ^',
                mode: semicolonIncluded,
                expected: 'a func(;);'
            },
            {
                source: 'func()',
                start:  '     ^',
                skip:   '     ^',
                mode: null,
                expected: ''
            },
            {
                source: 'func([{}])',
                start:  '      ^',
                skip:   '       ^',
                mode: null,
                expected: '{}'
            },
            {
                source: 'func([{})',
                start:  '     ^',
                skip:   '      ^',
                mode: null,
                expected: '[{})'
            },
            {
                source: 'func(1, 2, 3) {}',
                start:  '^',
                skip:   '      ^',
                mode: null,
                expected: 'func(1, 2, 3) {}'
            }
        ];
        /* eslint-enable key-spacing */

        tests.forEach(function(test, idx) {
            it('testcase#' + idx, () => {
                const stream = createStream(test.source, tokenize);
                const startOffset = test.start.indexOf('^');
                const skipToOffset = test.skip.indexOf('^');
                let startToken = stream.tokenIndex;

                while (stream.tokenStart < startOffset) {
                    stream.next();
                    startToken = stream.tokenIndex;
                }

                while (stream.tokenStart < skipToOffset) {
                    stream.next();
                }

                stream.skipUntilBalanced(startToken, test.mode || (() => 0));
                assert.strictEqual(
                    stream.source.substring(startOffset, stream.tokenStart),
                    test.expected
                );
            });
        });
    });

    it('dynamic buffer', () => {
        const bufferSize = createStream(css, tokenize).offsetAndType.length + 10;
        const stream = createStream('.'.repeat(bufferSize), tokenize);
        let count = 0;

        while (!stream.eof) {
            count++;
            stream.next();
        }

        assert.strictEqual(count, bufferSize);
        assert(stream.offsetAndType.length >= bufferSize);
    });

    describe('public token accessors', () => {
        it('getTokenType() / getTokenStart() / getTokenEnd()', () => {
            const stream = createStream(css);
            const byType = [];

            tokenize(css, (type, start, end) => {
                byType.push({ type, start, end });
            });

            for (let i = 0; i < stream.tokenCount; i++) {
                assert.strictEqual(stream.getTokenType(i), byType[i].type);
                assert.strictEqual(stream.getTokenStart(i), byType[i].start);
                assert.strictEqual(stream.getTokenEnd(i), byType[i].end);
                assert.strictEqual(
                    stream.source.substring(stream.getTokenStart(i), stream.getTokenEnd(i)),
                    tokens[i].chunk
                );
            }
        });

        it('getTokenType() out of range returns EOF', () => {
            const stream = createStream(css);

            assert.strictEqual(stream.getTokenType(-1), tokenTypes.EOF);
            assert.strictEqual(stream.getTokenType(stream.tokenCount), tokenTypes.EOF);
            assert.strictEqual(stream.getTokenType(stream.tokenCount + 10), tokenTypes.EOF);
        });

        it('getTokenStart()/getTokenEnd() out of range are safe', () => {
            const stream = createStream(css);

            assert.strictEqual(stream.getTokenStart(stream.tokenCount), css.length);
            assert.strictEqual(stream.getTokenEnd(stream.tokenCount), css.length);
            assert.strictEqual(stream.getTokenEnd(stream.tokenCount + 10), css.length);
            assert.strictEqual(stream.getTokenStart(-1), stream.firstCharOffset);
            assert.strictEqual(stream.getTokenEnd(-1), stream.firstCharOffset);
        });

        it('handles BOM', () => {
            const stream = createStream('\uFEFFa{}');

            assert.strictEqual(stream.firstCharOffset, 1);
            assert.strictEqual(stream.getTokenStart(0), 1);
            assert.strictEqual(stream.getTokenType(0), tokenTypes.Ident);
        });

        it('isBlockOpenerType() / isBlockCloserType()', () => {
            const stream = createStream(css);

            for (const type of [
                tokenTypes.Function,
                tokenTypes.LeftParenthesis,
                tokenTypes.LeftSquareBracket,
                tokenTypes.LeftCurlyBracket
            ]) {
                assert.strictEqual(stream.isBlockOpenerType(type), true, tokenNames[type] + ' is opener');
                assert.strictEqual(stream.isBlockCloserType(type), false);
            }

            for (const type of [
                tokenTypes.RightParenthesis,
                tokenTypes.RightSquareBracket,
                tokenTypes.RightCurlyBracket
            ]) {
                assert.strictEqual(stream.isBlockCloserType(type), true, tokenNames[type] + ' is closer');
                assert.strictEqual(stream.isBlockOpenerType(type), false);
            }

            for (const type of [tokenTypes.Ident, tokenTypes.EOF, tokenTypes.Delim, tokenTypes.Comment]) {
                assert.strictEqual(stream.isBlockOpenerType(type), false);
                assert.strictEqual(stream.isBlockCloserType(type), false);
            }
        });

        describe('getBalancePair()', () => {
            const pairTypes = new Map([
                [tokenTypes.Function, tokenTypes.RightParenthesis],
                [tokenTypes.LeftParenthesis, tokenTypes.RightParenthesis],
                [tokenTypes.LeftSquareBracket, tokenTypes.RightSquareBracket],
                [tokenTypes.LeftCurlyBracket, tokenTypes.RightCurlyBracket]
            ]);

            it('matched pairs find each other both ways with correct types', () => {
                const source = 'a { fn(x[1]) } { } ( )';
                const stream = createStream(source);

                for (let i = 0; i < stream.tokenCount; i++) {
                    const type = stream.getTokenType(i);

                    if (pairTypes.has(type)) {
                        const pair = stream.getBalancePair(i);
                        assert.notStrictEqual(pair, -1, tokenNames[type] + '#' + i + ' has pair');
                        assert.strictEqual(stream.getTokenType(pair), pairTypes.get(type));
                        assert.strictEqual(stream.getBalancePair(pair), i);
                    } else if ([
                        tokenTypes.RightParenthesis,
                        tokenTypes.RightSquareBracket,
                        tokenTypes.RightCurlyBracket
                    ].includes(type)) {
                        const pair = stream.getBalancePair(i);
                        assert.notStrictEqual(pair, -1);
                        assert.strictEqual(pairTypes.get(stream.getTokenType(pair)), type);
                        assert.strictEqual(stream.getBalancePair(pair), i);
                    }
                }
            });

            it('unclosed block/function: opener resolves to -1', () => {
                const cases = [
                    { source: 'a {', opener: tokenTypes.LeftCurlyBracket },
                    { source: 'rgb(', opener: tokenTypes.Function },
                    { source: '([', opener: tokenTypes.LeftSquareBracket },
                    { source: 'a { color: red', opener: tokenTypes.LeftCurlyBracket }
                ];

                for (const { source, opener } of cases) {
                    const stream = createStream(source);
                    let openerIndex = -1;

                    for (let i = 0; i < stream.tokenCount; i++) {
                        if (stream.getTokenType(i) === opener) {
                            openerIndex = i;
                        }
                        // never throws, result is in range or -1
                        const pair = stream.getBalancePair(i);
                        assert.ok(pair === -1 || pair < stream.tokenCount, source + ' token#' + i);
                        if (pair !== -1) {
                            assert.strictEqual(stream.getBalancePair(pair), i);
                        }
                    }

                    assert.notStrictEqual(openerIndex, -1);
                    assert.strictEqual(stream.getBalancePair(openerIndex), -1, source);
                }
            });

            it('extra closing tokens resolve to -1', () => {
                const cases = [
                    { source: ')}', closer: tokenTypes.RightParenthesis },
                    { source: 'a {} }', closer: tokenTypes.RightCurlyBracket },
                    { source: ']', closer: tokenTypes.RightSquareBracket }
                ];

                for (const { source, closer } of cases) {
                    const stream = createStream(source);
                    let closerIndex = -1;

                    for (let i = 0; i < stream.tokenCount; i++) {
                        const pair = stream.getBalancePair(i);
                        assert.ok(pair === -1 || pair < stream.tokenCount);
                        if (pair !== -1) {
                            assert.strictEqual(stream.getBalancePair(pair), i);
                        }
                        if (stream.getTokenType(i) === closer && stream.getBalancePair(i) === -1) {
                            closerIndex = i;
                        }
                    }

                    assert.notStrictEqual(closerIndex, -1, 'unmatched closer found in ' + source);
                }
            });

            it('never points to a token of mismatched type', () => {
                const cases = [
                    '( [ ) ]',
                    '([)]',
                    '{ ) }',
                    '{ ] }',
                    '( ] )'
                ];

                for (const source of cases) {
                    const stream = createStream(source);

                    for (let i = 0; i < stream.tokenCount; i++) {
                        const type = stream.getTokenType(i);
                        const pair = stream.getBalancePair(i);

                        if (pair === -1) {
                            continue;
                        }

                        const pairType = stream.getTokenType(pair);
                        if (pairTypes.has(type)) {
                            assert.strictEqual(pairType, pairTypes.get(type), source + ' opener #' + i);
                        } else {
                            assert.strictEqual(pairTypes.get(pairType), type, source + ' closer #' + i);
                        }
                        assert.strictEqual(stream.getBalancePair(pair), i);
                    }
                }
            });

            it('out of range indexes return -1', () => {
                const stream = createStream('a{b}c');

                assert.strictEqual(stream.getBalancePair(-1), -1);
                assert.strictEqual(stream.getBalancePair(stream.tokenCount), -1);
                assert.strictEqual(stream.getBalancePair(stream.tokenCount + 5), -1);
            });

            it('non-bracket tokens return -1', () => {
                const stream = createStream('a 1 "s" ; , : #x');

                for (let i = 0; i < stream.tokenCount; i++) {
                    assert.strictEqual(stream.getBalancePair(i), -1);
                }
            });
        });
    });

    describe('values', () => {
        ['valid', 'invalid'].forEach(testType => {
            fixture.forEachTest(testType, (name, value, expected) => {
                it(name, () => {
                    const actual = [];

                    tokenize(value, (type, start, end) => actual.push({
                        type: tokenNames[type],
                        chunk: value.substring(start, end)
                    }));

                    assert[testType === 'valid' ? 'deepEqual' : 'notDeepEqual'](
                        actual,
                        expected
                    );
                });
            });
        });
    });
});
