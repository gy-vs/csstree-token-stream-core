# Parsing

> [csstree](https://github.com/csstree/csstree) converts CSS into an AST with `parse()`. This document covers parsing options and the `onToken` option, which exposes the token stream produced during parsing so a single `parse()` call yields both the AST and the tokens.

- [parse(source[, options\])](#parsesource-options)
- [Options](#options)
- [onToken](#ontoken)
  - [Array form](#array-form)
  - [Callback form](#callback-form)
  - [The token query object](#the-token-query-object)
- [TokenStream methods](#tokenstream-methods)
- [Token type constants](#token-type-constants)

## parse(source[, options])

Parses CSS and returns an AST.

```js
import { parse } from 'css-tree';

const ast = parse('.example { color: red }');
```

## Options

<!-- options -->

- [context](#context)
- [positions](#positions)
- [filename](#filename)
- [offset](#offset)
- [line](#line)
- [column](#column)
- [onParseError](#onparseerror)
- [onComment](#oncomment)
- [onToken](#ontoken)
- [parseAtrulePrelude](#parseatruleprelude)
- [parseRulePrelude](#parseruleprelude)
- [parseValue](#parsevalue)
- [parseCustomProperty](#parsecustomproperty)

<!-- /options -->

### context

Type: `string` or `false`. Default: `'default'`.

A parsing context. For details see the [start rule for parsing](https://github.com/csstree/csstree/blob/master/lib/syntax/config/parser.js) in default config.

### positions

Type: `boolean`. Default: `false`.

Should AST nodes contain information about their positions in source code (`loc` property).

### filename

Type: `string`. Default `'<unknown>'`.

Filename that will be used in positions as a source of a node.

### offset

Type: `number`. Default: `0`.

Start offset, that will be used in positions. Useful when a parsed CSS is a part of another document (e.g. a `<style>` tag in an SFC).

### line

Type: `number`. Default: `1`.

Start line, that will be used in positions.

### column

Type: `number`. Default: `1`.

Start column, that will be used in positions.

### onParseError

Type: `function`. Default: `none`.

The callback is called when a parser encounters a parse error and falls back to a tolerant parsing. The callback receives a single argument – an error instance with the same structure as an error thrown in strict mode.

### onComment

Type: `function`. Default: `none`.

The callback that is called for every comment token before AST parsing starts. A callback receives two arguments: a comment value (without `/*` and `*/`) and a location (when the `positions` option is enabled).

### onToken

Type: `Array` or `function`. Default: `none`.

Exposes the tokens produced for `source` by the same tokenizer pass the parser uses internally – no additional tokenization is needed. Tokens cover the entire source (including comments and whitespace) and are delivered in source order, before AST parsing starts. All parser options keep working as usual, and the resulting AST is exactly the same as without `onToken`. `onToken` can be used together with [onComment](#oncomment).

There are two forms.

#### Array form

Pass an array, and an object `{ type, start, end }` is appended to it for every token:

- `type` – numeric token type (see [Token type constants](#token-type-constants))
- `start` – start offset of the token
- `end` – offset immediately after the token

```js
import { parse, tokenTypes } from 'css-tree';

const tokens = [];
parse('.a { color: red }', { onToken: tokens });

// [
//   { type: 9,  start: 0, end: 1 },   // <delim-token> "."
//   { type: 1,  start: 1, end: 2 },   // <ident-token> "a"
//   { type: 13, start: 2, end: 3 },   // <whitespace-token>
//   { type: 23, start: 3, end: 4 },   // <{-token>
//   ...
// ]

tokens[1].type === tokenTypes.Ident; // true
```

If the passed array already contains elements, tokens are appended (the array is not cleared).

#### Callback form

Pass a function and it is called once per token in source order with the arguments:

- `type` – numeric token type
- `start` – start offset of the token
- `end` – offset immediately after the token
- `index` – zero-based ordinal index of the token (the same index the parser and AST-related rules refer to)

`this` inside the callback is a [token query object](#the-token-query-object). The complete token stream for the whole source is available from the very first callback – it is safe to query tokens at indexes the parser has not reached yet:

```js
import { parse } from 'css-tree';

parse('a { color: red }', {
    onToken(type, start, end, index) {
        if (index === 0) {
            // full source information is already available
            console.log(this.tokenCount);           // 10
            console.log(this.getTokenValue(0));     // "a"
            console.log(this.getBalancePair(2));    // 9 (index of the matching "}")
        }
    }
});
```

#### The token query object

The object passed as `this` to an `onToken` callback exposes the following properties and methods.

Properties:

- `tokenCount` – total number of tokens in the source
- `filename` – the `filename` option of the current parse (`'<unknown>'` by default)
- `source` – the source string of the current parse

Token lookups by index (indexes outside `[0, tokenCount - 1]` are safe and never throw):

- `getTokenType(index)` – numeric token type, or `EOF` (`0`) for an out of range index
- `getTokenName(index)` – token type name, e.g. `'ident-token'`, `'(-token'`, `'function-token'`
- `getTokenStart(index)` – start offset of a token
- `getTokenEnd(index)` – offset immediately after a token
- `getTokenValue(index)` – source text of a token
- `substring(start, end)` – source substring, like `String.prototype.substring`

Block types:

- `isBlockOpenerType(type)` – `true` for `<function-token>`, `<(-token>`, `<[-token>` and `<{-token>`
- `isBlockCloserType(type)` – `true` for `<)-token>`, `<]-token>` and `<}-token>`

Pair lookup:

- `getBalancePair(index)` – index of the token paired with the given one (the other end of a matched function call, parenthesis, square bracket or curly bracket), or `-1` when the token is not part of a matched pair. Matching is based on token types, so malformed input gets a deterministic answer rather than a pointer to a wrong token: an unclosed block, an extra closing bracket or an unclosed function call resolves to `-1`. For a matched pair the lookup works both ways:

```js
parse('a { color: rgb(1, 2) }', {
    onToken(type, start, end, index) {
        const pair = this.getBalancePair(index); // index of "{" or "}" counterpart, etc.

        if (pair !== -1) {
            this.getBalancePair(pair) === index; // always true
        }
    }
});
```

Locations (computed with the same offset-to-location machinery as AST node `loc`, so line/column values match node locations and honor the `offset`, `line` and `column` options):

- `getLocation(offset[, filename])` – `{ source, offset, line, column }` for a single point
- `getLocationRange(start, end[, filename])` – `{ source, start: { offset, line, column }, end: { offset, line, column } }` for an interval

Offsets are clamped to the source bounds, so these methods never return positions outside the source.

## TokenStream methods

Rules that work with a `TokenStream` directly (constructed with the exported `tokenize` function) can use the same indexed accessors. Method names and semantics match the [token query object](#the-token-query-object):

```js
import { TokenStream, tokenize } from 'css-tree';

const stream = new TokenStream('a { color: rgb(1, 2) }', tokenize);

stream.getTokenType(2);             // 23 (LeftCurlyBracket)
stream.getTokenStart(2);            // 2
stream.getTokenEnd(2);              // 3
stream.isBlockOpenerType(23);       // true
stream.isBlockCloserType(24);       // true
stream.getBalancePair(2);           // 14 (index of the matching "}")
stream.getBalancePair(stream.tokenCount); // -1, safe on bad input / out of range
```

Available methods:

- `getTokenType(index)`
- `getTokenStart(index)`
- `getTokenEnd(index)`
- `isBlockOpenerType(type)`
- `isBlockCloserType(type)`
- `getBalancePair(index)`

## Token type constants

Numeric token types are exported as `tokenTypes` (and as named exports) and their names as `tokenNames`:

```js
import { tokenTypes, tokenNames } from 'css-tree';

tokenTypes.Ident;            // 1
tokenNames[tokenTypes.Ident]; // "ident-token"
```

| Constant                 | Value | Name                |
|--------------------------|-------|---------------------|
| `EOF`                    | 0     | `EOF-token`         |
| `Ident`                  | 1     | `ident-token`       |
| `Function`               | 2     | `function-token`    |
| `AtKeyword`              | 3     | `at-keyword-token`  |
| `Hash`                   | 4     | `hash-token`        |
| `String`                 | 5     | `string-token`      |
| `BadString`              | 6     | `bad-string-token`  |
| `Url`                    | 7     | `url-token`         |
| `BadUrl`                 | 8     | `bad-url-token`     |
| `Delim`                  | 9     | `delim-token`       |
| `Number`                 | 10    | `number-token`      |
| `Percentage`             | 11    | `percentage-token`  |
| `Dimension`              | 12    | `dimension-token`   |
| `WhiteSpace`             | 13    | `whitespace-token`  |
| `CDO`                    | 14    | `CDO-token`         |
| `CDC`                    | 15    | `CDC-token`         |
| `Colon`                  | 16    | `colon-token`       |
| `Semicolon`              | 17    | `semicolon-token`   |
| `Comma`                  | 18    | `comma-token`       |
| `LeftSquareBracket`      | 19    | `[-token`           |
| `RightSquareBracket`     | 20    | `]-token`           |
| `LeftParenthesis`        | 21    | `(-token`           |
| `RightParenthesis`       | 22    | `)-token`           |
| `LeftCurlyBracket`       | 23    | `{-token`           |
| `RightCurlyBracket`      | 24    | `}-token`           |
| `Comment`                | 25    | `comment-token`     |
