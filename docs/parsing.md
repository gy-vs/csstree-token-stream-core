# Parsing

- [parse(source, options)](#parsesource-options)
- [onToken](#ontoken)
  - [Array form](#array-form)
  - [Function form](#function-form)
  - [Token query object](#token-query-object)
  - [Bracket pairing](#bracket-pairing)
  - [Locations](#locations)
- [TokenStream](#tokenstream)

## parse(source, options)

```js
import { parse } from 'css-tree';

const ast = parse('.foo { color: red }', {
    context: 'default',
    positions: true,
    filename: 'style.css'
});
```

`parse()` tokenizes the whole source before building the AST. The `onToken`
option exposes that single, internal tokenization, so a plugin doesn't have to
tokenize the source a second time.

## onToken

`onToken` accepts either an array or a function.

### Array form

Pass an array and, once parsing finishes, it contains every token in source
order as `{ type, start, end }` objects:

```js
import { parse } from 'css-tree';

const tokens = [];
parse('.foo { color: red }', { onToken: tokens });

// [
//   { type: 9,  start: 0, end: 1 },  // delim-token        "."
//   { type: 1,  start: 1, end: 4 },  // ident-token        "foo"
//   { type: 13, start: 4, end: 5 },  // whitespace-token   " "
//   { type: 23, start: 5, end: 6 },  // {-token            "{"
//   ...
// ]
```

- `type` &mdash; numeric token type, same values as `tokenTypes` /
  `tokenNames` exported from `css-tree` (and `css-tree/tokenizer`).
- `start`, `end` &mdash; zero-based offsets into the source; use
  `source.slice(start, end)` to get the token text.

Tokens are collected even when parsing throws afterwards, since tokenization
completes before the AST is built.

### Function form

Pass a function and it's invoked once per token in source order:

```js
parse(source, {
    onToken(type, start, end, index) {
        // type  - numeric token type
        // start - start offset in the source
        // end   - end offset in the source
        // index - zero-based token index, identical to the one used internally
    }
});
```

`this` inside the callback is a [token query object](#token-query-object).
The whole source is already tokenized when the first callback fires, so any
token index &mdash; including "future" tokens &mdash; can be queried from any
callback invocation:

```js
parse(source, {
    onToken(type, start, end, index) {
        if (index === 0) {
            // valid even while the first token is being delivered
            const lastType = this.getTokenType(this.tokenCount - 1);
        }
    }
});
```

`onToken` can be used together with `onComment`; enabling either or both
never changes the resulting AST, and all other parse options keep working.

### Token query object

The object available as `this` in the function-form callback:

| Member | Description |
| --- | --- |
| `tokenCount` | Number of tokens in the source. |
| `filename` | Value of the parse `filename` option (`'<unknown>'` by default). |
| `source` | The source string passed to `parse()`. |
| `getTokenType(index)` | Numeric token type at `index`; returns `tokenTypes.EOF` for an out-of-range index. |
| `getTokenTypeName(index)` | Token type name at `index` (e.g. `'ident-token'`), same strings as `tokenNames`. |
| `getTokenStart(index)` | Start offset of the token at `index`. |
| `getTokenEnd(index)` | End offset of the token at `index`. |
| `getTokenValue(index)` | Token text, i.e. `source.substring(start, end)`. |
| `substring(start, end)` | A fragment of the source. |
| `isBlockOpenerType(type)` | Whether `type` opens a block: `function-token`, `(-token`, `[-token` or `{-token`. |
| `isBlockCloserType(type)` | Whether `type` closes a block: `)-token`, `]-token` or `}-token`. |
| `getTokenPair(index)` | Index of the token paired with the one at `index`, or `-1` when there is no pair. See [Bracket pairing](#bracket-pairing). |
| `getLocation(offset)` | `{ source, offset, line, column }` for a single offset. |
| `getLocationRange(start, end)` | `{ source, start: point, end: point }` for an offset interval. |

Indices, types and offsets returned by this object are exactly the ones the
parser uses internally for the current `parse()` call, so a token index can be
stored and later compared against AST node positions.

### Bracket pairing

`getTokenPair(index)` finds the other end of a pair:

- a `function-token` (`rgb(`) or `(-token` pairs with a `)-token`;
- a `[-token` pairs with a `]-token`;
- a `{-token` pairs with a `}-token`.

Matched pairs are bidirectional: looking up either end returns the other.
A pair is only reported when both tokens actually match each other, so a
pairing can never point at a token of a wrong type. For malformed input &mdash;
unclosed blocks (`a {`), unclosed function calls (`rgb(`), stray closing
brackets (`a {} }`), or mismatched nesting (`( { )`) &mdash; the method
returns `-1` instead of throwing:

```js
parse('a { color: red; }', {
    onToken(type, start, end, index) {
        const pair = this.getTokenPair(index);

        if (pair !== -1) {
            console.log(this.getTokenValue(index), '<->', this.getTokenValue(pair));
        }
    }
});
// "{" <-> "}"
```

Note: a `url-token` consumes its closing parenthesis itself (e.g.
`url(foo)` is a single token) and therefore has no pair.

### Locations

`getLocation(offset)` and `getLocationRange(start, end)` use the same
`offset`, `line` and `column` start values as AST node `loc` data, so their
results line up with node locations within the same parse &mdash; including
when parsing a fragment such as a `<style>` block in a Vue single-file
component:

```js
parse(styleContent, {
    positions: true,
    filename: 'component.vue',
    offset: styleStartOffset,
    line: styleStartLine,
    column: styleStartColumn,
    onToken(type, start, end, index) {
        const loc = this.getLocationRange(start, end);
        // loc.start / loc.end use the same line/column basis as AST node locs
    }
});
```

## TokenStream

Rules that work with tokens directly can use the `TokenStream` class exported
from `css-tree` (and `css-tree/tokenizer`). It exposes the same index-based,
cursor-independent lookups as the [token query object](#token-query-object):

```js
import { TokenStream, tokenize, tokenTypes } from 'css-tree';

const stream = new TokenStream('a { color: rgb(1, 2); }', tokenize);

stream.tokenCount;               // number of tokens
stream.getTokenType(0);          // tokenTypes.Ident
stream.getTokenStart(0);         // 0
stream.getTokenEnd(0);           // 1
stream.isBlockOpenerType(tokenTypes.LeftCurlyBracket); // true
stream.isBlockCloserType(tokenTypes.RightCurlyBracket); // true
stream.getTokenPair(openerIndex); // index of the matching "}" or -1
```

| Method | Description |
| --- | --- |
| `getTokenType(index)` | Numeric token type at `index`; `EOF` out of range. |
| `getTokenStart(index)` | Start offset of the token at `index`. |
| `getTokenEnd(index)` | End offset of the token at `index`. |
| `isBlockOpenerType(type)` | Whether `type` is `function(`, `(`, `[` or `{`. |
| `isBlockCloserType(type)` | Whether `type` is `)`, `]` or `}`. |
| `getTokenPair(index)` | Paired token index, or `-1`; symmetric for matched pairs and safe on malformed input. |
