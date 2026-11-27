/**
 * AeroSolve — Milestone 6.1: Mathematical Expression Parser
 *
 * Implements a standalone deterministic recursive-descent parser and lexer that
 * converts a sequence of recognized mathematical tokens or expression strings
 * into a structured Abstract Syntax Tree (AST), enforcing operator precedence,
 * left-associativity, and parentheses nesting.
 *
 * Scope: Parsing and structural validation ONLY. Zero numerical evaluation.
 */

/**
 * Custom Parse Error carrying error code and token position.
 */
export class ParseError extends Error {
  constructor(message, code = 'PARSE_ERROR', position = -1) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
    this.position = position;
  }
}

/**
 * Token types supported by Milestone 6.1.
 */
export const TokenType = {
  INTEGER: 'INTEGER',
  PLUS: 'PLUS',
  MINUS: 'MINUS',
  STAR: 'STAR',
  SLASH: 'SLASH',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  EOF: 'EOF',
};

/**
 * Tokenize an input string or an array of recognized symbol items into structured tokens.
 *
 * Multi-digit integer grouping is handled exclusively within this tokenizer.
 * Consecutive digits without intervening operators or delimiters are grouped into
 * a single multi-digit integer token.
 *
 * @param {string | Array<string | { value?: string, label?: string }>} input
 * @returns {Array<{ type: string, value: string | number, raw: string, position: number }>}
 */
export function tokenize(input) {
  if (input === null || input === undefined) {
    throw new ParseError('Expression input cannot be null or undefined', 'EMPTY_EXPRESSION', 0);
  }

  const tokens = [];

  // Case A: Input is an array of tokens / recognized symbol objects
  if (Array.isArray(input)) {
    if (input.length === 0) {
      throw new ParseError('Expression input array cannot be empty', 'EMPTY_EXPRESSION', 0);
    }

    let i = 0;
    while (i < input.length) {
      const item = input[i];
      const rawVal = typeof item === 'object' && item !== null
        ? String(item.value ?? item.label ?? '').trim()
        : String(item).trim();

      if (!rawVal) {
        i++;
        continue;
      }

      // If it's a digit, check for consecutive digits to group into a multi-digit integer
      if (/^\d+$/.test(rawVal)) {
        let combinedDigits = rawVal;
        const startPos = i;
        while (i + 1 < input.length) {
          const nextItem = input[i + 1];
          const nextVal = typeof nextItem === 'object' && nextItem !== null
            ? String(nextItem.value ?? nextItem.label ?? '').trim()
            : String(nextItem).trim();

          // Only combine if the next item is also a pure digit
          if (/^\d+$/.test(nextVal)) {
            combinedDigits += nextVal;
            i++;
          } else {
            break;
          }
        }
        tokens.push({
          type: TokenType.INTEGER,
          value: parseInt(combinedDigits, 10),
          raw: combinedDigits,
          position: startPos,
        });
      } else if (rawVal === '+') {
        tokens.push({ type: TokenType.PLUS, value: '+', raw: '+', position: i });
      } else if (rawVal === '-') {
        tokens.push({ type: TokenType.MINUS, value: '-', raw: '-', position: i });
      } else if (rawVal === '*' || rawVal === '×' || rawVal === 'x' || rawVal === 'X') {
        tokens.push({ type: TokenType.STAR, value: '*', raw: rawVal, position: i });
      } else if (rawVal === '/' || rawVal === '÷') {
        tokens.push({ type: TokenType.SLASH, value: '/', raw: rawVal, position: i });
      } else if (rawVal === '(') {
        tokens.push({ type: TokenType.LPAREN, value: '(', raw: '(', position: i });
      } else if (rawVal === ')') {
        tokens.push({ type: TokenType.RPAREN, value: ')', raw: ')', position: i });
      } else {
        throw new ParseError(`Unrecognized symbol: "${rawVal}"`, 'INVALID_CHARACTER', i);
      }
      i++;
    }

    if (tokens.length === 0) {
      throw new ParseError('Expression input contains no valid tokens', 'EMPTY_EXPRESSION', 0);
    }

    tokens.push({ type: TokenType.EOF, value: '', raw: '', position: input.length });
    return tokens;
  }

  // Case B: Input is a string
  const str = String(input);
  if (str.trim().length === 0) {
    throw new ParseError('Expression string cannot be empty', 'EMPTY_EXPRESSION', 0);
  }

  let idx = 0;
  while (idx < str.length) {
    const ch = str[idx];

    // Skip whitespace
    if (/\s/.test(ch)) {
      idx++;
      continue;
    }

    // Integer / Multi-digit grouping
    if (/\d/.test(ch)) {
      let numStr = '';
      const startPos = idx;
      while (idx < str.length && /\d/.test(str[idx])) {
        numStr += str[idx];
        idx++;
      }
      tokens.push({
        type: TokenType.INTEGER,
        value: parseInt(numStr, 10),
        raw: numStr,
        position: startPos,
      });
      continue;
    }

    // Single-character operators & delimiters
    if (ch === '+') {
      tokens.push({ type: TokenType.PLUS, value: '+', raw: '+', position: idx });
    } else if (ch === '-') {
      tokens.push({ type: TokenType.MINUS, value: '-', raw: '-', position: idx });
    } else if (ch === '*' || ch === '×' || ch === 'x' || ch === 'X') {
      tokens.push({ type: TokenType.STAR, value: '*', raw: ch, position: idx });
    } else if (ch === '/' || ch === '÷') {
      tokens.push({ type: TokenType.SLASH, value: '/', raw: ch, position: idx });
    } else if (ch === '(') {
      tokens.push({ type: TokenType.LPAREN, value: '(', raw: '(', position: idx });
    } else if (ch === ')') {
      tokens.push({ type: TokenType.RPAREN, value: ')', raw: ')', position: idx });
    } else {
      throw new ParseError(`Unrecognized character: "${ch}" at position ${idx}`, 'INVALID_CHARACTER', idx);
    }

    idx++;
  }

  if (tokens.length === 0) {
    throw new ParseError('Expression contains no valid tokens', 'EMPTY_EXPRESSION', 0);
  }

  tokens.push({ type: TokenType.EOF, value: '', raw: '', position: str.length });
  return tokens;
}

/**
 * Recursive-descent parser state machine.
 */
class ExpressionParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.current = 0;
  }

  peek() {
    return this.tokens[this.current] || { type: TokenType.EOF, value: '', position: -1 };
  }

  previous() {
    return this.tokens[this.current - 1];
  }

  isAtEnd() {
    return this.peek().type === TokenType.EOF;
  }

  advance() {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  check(type) {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  match(...types) {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  /**
   * Top-level entry point.
   * Parses the expression and verifies that all tokens are consumed.
   */
  parse() {
    // Check for leading binary operator
    const first = this.peek();
    if ([TokenType.STAR, TokenType.SLASH, TokenType.PLUS].includes(first.type)) {
      throw new ParseError(
        `Unexpected operator "${first.raw}" at start of expression`,
        'UNEXPECTED_OPERATOR',
        first.position
      );
    }
    if (first.type === TokenType.MINUS) {
      throw new ParseError(
        "Unary operators (e.g. leading '-') are not supported in Milestone 6.1; expressions must begin with a number or '('",
        'UNSUPPORTED_UNARY',
        first.position
      );
    }

    const ast = this.expression();

    // Verify full consumption
    if (!this.isAtEnd()) {
      const remaining = this.peek();
      if (remaining.type === TokenType.RPAREN) {
        throw new ParseError(
          `Unmatched closing parenthesis ')' at position ${remaining.position}`,
          'UNMATCHED_PARENTHESIS',
          remaining.position
        );
      }
      if (remaining.type === TokenType.INTEGER) {
        throw new ParseError(
          `Unexpected number "${remaining.raw}" without an operator at position ${remaining.position}`,
          'UNEXPECTED_TOKEN',
          remaining.position
        );
      }
      throw new ParseError(
        `Unexpected token "${remaining.raw}" at position ${remaining.position}`,
        'UNEXPECTED_TOKEN',
        remaining.position
      );
    }

    return ast;
  }

  /**
   * Expression ::= Term ( ('+' | '-') Term )*
   * Left-associative addition and subtraction (Precedence 1)
   */
  expression() {
    let expr = this.term();

    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operatorToken = this.previous();
      const operator = operatorToken.value;

      // Check for trailing operator or consecutive operators
      if (this.isAtEnd()) {
        throw new ParseError(
          `Unexpected end of expression; expected operand after "${operator}"`,
          'UNEXPECTED_END',
          operatorToken.position
        );
      }

      const nextTok = this.peek();
      if ([TokenType.PLUS, TokenType.STAR, TokenType.SLASH].includes(nextTok.type)) {
        throw new ParseError(
          `Unexpected consecutive operator "${nextTok.raw}" after "${operator}" at position ${nextTok.position}`,
          'CONSECUTIVE_OPERATORS',
          nextTok.position
        );
      }
      if (nextTok.type === TokenType.MINUS) {
        throw new ParseError(
          `Unary minus following operator "${operator}" is not supported in Milestone 6.1`,
          'UNSUPPORTED_UNARY',
          nextTok.position
        );
      }

      const right = this.term();
      expr = {
        type: 'BinaryExpression',
        operator,
        left: expr,
        right,
      };
    }

    return expr;
  }

  /**
   * Term ::= Factor ( ('*' | '/') Factor )*
   * Left-associative multiplication and division (Precedence 2)
   */
  term() {
    let expr = this.factor();

    while (this.match(TokenType.STAR, TokenType.SLASH)) {
      const operatorToken = this.previous();
      const operator = operatorToken.value;

      // Check for trailing operator or consecutive operators
      if (this.isAtEnd()) {
        throw new ParseError(
          `Unexpected end of expression; expected operand after "${operator}"`,
          'UNEXPECTED_END',
          operatorToken.position
        );
      }

      const nextTok = this.peek();
      if ([TokenType.STAR, TokenType.SLASH, TokenType.PLUS].includes(nextTok.type)) {
        throw new ParseError(
          `Unexpected consecutive operator "${nextTok.raw}" after "${operator}" at position ${nextTok.position}`,
          'CONSECUTIVE_OPERATORS',
          nextTok.position
        );
      }
      if (nextTok.type === TokenType.MINUS) {
        throw new ParseError(
          `Unary minus following operator "${operator}" is not supported in Milestone 6.1`,
          'UNSUPPORTED_UNARY',
          nextTok.position
        );
      }

      const right = this.factor();
      expr = {
        type: 'BinaryExpression',
        operator,
        left: expr,
        right,
      };
    }

    return expr;
  }

  /**
   * Factor ::= Integer | '(' Expression ')'
   */
  factor() {
    if (this.match(TokenType.INTEGER)) {
      const tok = this.previous();
      return {
        type: 'Literal',
        value: tok.value,
        raw: tok.raw,
      };
    }

    if (this.match(TokenType.LPAREN)) {
      const openParen = this.previous();

      // Check for empty parentheses ()
      if (this.check(TokenType.RPAREN)) {
        throw new ParseError(
          `Empty parentheses '()' are not allowed at position ${openParen.position}`,
          'EMPTY_PARENTHESES',
          openParen.position
        );
      }

      // Check for leading operator inside parenthesis e.g. (+ 3) or (* 3)
      const nextTok = this.peek();
      if ([TokenType.STAR, TokenType.SLASH, TokenType.PLUS].includes(nextTok.type)) {
        throw new ParseError(
          `Unexpected operator "${nextTok.raw}" after opening parenthesis at position ${nextTok.position}`,
          'UNEXPECTED_OPERATOR',
          nextTok.position
        );
      }
      if (nextTok.type === TokenType.MINUS) {
        throw new ParseError(
          `Unary minus inside parentheses at position ${nextTok.position} is not supported in Milestone 6.1`,
          'UNSUPPORTED_UNARY',
          nextTok.position
        );
      }

      const expr = this.expression();

      if (!this.match(TokenType.RPAREN)) {
        throw new ParseError(
          `Unmatched opening parenthesis '(' from position ${openParen.position}`,
          'UNMATCHED_PARENTHESIS',
          openParen.position
        );
      }

      return expr;
    }

    const currentTok = this.peek();
    if (currentTok.type === TokenType.RPAREN) {
      throw new ParseError(
        `Unmatched closing parenthesis ')' at position ${currentTok.position}`,
        'UNMATCHED_PARENTHESIS',
        currentTok.position
      );
    }

    if (currentTok.type === TokenType.EOF) {
      throw new ParseError(
        'Unexpected end of expression; expected an operand',
        'UNEXPECTED_END',
        currentTok.position
      );
    }

    throw new ParseError(
      `Unexpected token "${currentTok.raw}" at position ${currentTok.position}`,
      'UNEXPECTED_TOKEN',
      currentTok.position
    );
  }
}

/**
 * Primary public API: Parse a recognized token sequence or math string into an AST.
 *
 * @param {string | Array<string | { value?: string, label?: string }>} input
 * @returns {{ type: string, [key: string]: any }} Structured AST Root Node
 */
export function parseExpression(input) {
  const tokens = tokenize(input);
  const parser = new ExpressionParser(tokens);
  return parser.parse();
}

/**
 * Format an AST into an explicit S-expression string for inspectability and assertions.
 *
 * Example:
 *   3 + 5 * 2 => "(+ 3 (* 5 2))"
 *   (3 + 5) * 2 => "(* (+ 3 5) 2)"
 *
 * @param {object} node
 * @returns {string}
 */
export function formatAST(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'Literal') {
    return String(node.value);
  }
  if (node.type === 'BinaryExpression') {
    return `(${node.operator} ${formatAST(node.left)} ${formatAST(node.right)})`;
  }
  return '';
}
