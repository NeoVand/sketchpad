export type Expr =
	| { kind: 'number'; text: string }
	| { kind: 'name'; name: string }
	| { kind: 'unary'; op: '-' | '+' | 'sqrt'; value: Expr }
	| { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Expr; right: Expr }
	| { kind: 'gcd'; left: Expr; right: Expr };
export interface Equation {
	left: Expr;
	right: Expr;
}
export type Statement =
	| { kind: 'expression'; value: Expr; places?: number }
	| { kind: 'assign'; name: string; value: Expr; places?: number }
	| { kind: 'solve'; equations: Equation[]; places?: number }
	| { kind: 'expand'; value: Expr }
	| { kind: 'factor'; value: Expr };
export interface WorkOrder {
	statements: Statement[];
}
interface Token {
	text: string;
	column: number;
}
export class ParseError extends Error {
	constructor(
		message: string,
		readonly token: string,
		readonly column: number,
		readonly line = 1
	) {
		super(`${message}: token ${JSON.stringify(token)} at line ${line}, column ${column}`);
		this.name = 'ParseError';
	}
}
function tokenize(source: string, line: number): Token[] {
	const tokens: Token[] = [];
	const re = /\s+|(?:\d+(?:\.\d*)?|\.\d+)|[A-Za-z_][A-Za-z_0-9]*|[+\-−*×/÷^()=,√]/gy;
	let pos = 0;
	while (pos < source.length) {
		re.lastIndex = pos;
		const m = re.exec(source);
		if (!m) throw new ParseError('Unexpected character', source[pos], pos + 1, line);
		const text = m[0];
		if (!/^\s/.test(text))
			tokens.push({
				text:
					({ '−': '-', '×': '*', '÷': '/', '√': 'sqrt' } as Record<string, string>)[text] ?? text,
				column: pos + 1
			});
		pos = re.lastIndex;
	}
	tokens.push({ text: '<end>', column: source.length + 1 });
	return tokens;
}
const isNumber = (s: string) => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s);
const isName = (s: string) => /^[A-Za-z_][A-Za-z_0-9]*$/.test(s);
const reserved = new Set(['solve', 'expand', 'factor', 'sqrt', 'gcd', 'to', 'places']);
export function exponent(expr: Expr): number {
	if (expr.kind === 'unary' && (expr.op === '-' || expr.op === '+'))
		return (expr.op === '-' ? -1 : 1) * exponent(expr.value);
	if (expr.kind !== 'number' || !/^\d+$/.test(expr.text) || Number(expr.text) > 12)
		throw new Error('Exponent must be a literal integer from -12 to 12');
	return Number(expr.text);
}
/** Total syntactic degree, without cancelling terms or expanding the expression. */
export function degree(expr: Expr, variables: readonly string[] = ['x']): number {
	switch (expr.kind) {
		case 'number':
			return 0;
		case 'name':
			return variables.includes(expr.name) ? 1 : 0;
		case 'gcd':
			throw new Error('gcd is not polynomial syntax');
		case 'unary':
			if (expr.op === 'sqrt') throw new Error('sqrt is not polynomial syntax');
			return degree(expr.value, variables);
		case 'binary': {
			const a = degree(expr.left, variables),
				b = degree(expr.right, variables);
			if (expr.op === '+' || expr.op === '-') return Math.max(a, b);
			if (expr.op === '*') return a + b;
			if (expr.op === '/') {
				if (b) throw new Error('Polynomial denominator must be constant');
				return a;
			}
			const e = exponent(expr.right);
			if (e < 0) throw new Error('Polynomial exponent must be nonnegative');
			return a * e;
		}
	}
}
export function names(expr: Expr): Set<string> {
	if (expr.kind === 'name') return new Set([expr.name]);
	if (expr.kind === 'number') return new Set();
	if (expr.kind === 'unary') return names(expr.value);
	return new Set([...names(expr.left), ...names(expr.right)]);
}
class Parser {
	private i = 0;
	constructor(
		private tokens: Token[],
		private line: number
	) {}
	private get t() {
		return this.tokens[this.i];
	}
	private error(message: string): never {
		throw new ParseError(message, this.t.text, this.t.column, this.line);
	}
	private take(s: string) {
		if (this.t.text === s) {
			this.i++;
			return true;
		}
		return false;
	}
	private need(s: string) {
		if (!this.take(s)) this.error(`Expected ${s}`);
	}
	private atom(): Expr {
		const t = this.t.text;
		if (isNumber(t)) {
			this.i++;
			return { kind: 'number', text: t };
		}
		if (this.take('(')) {
			const value = this.expression();
			this.need(')');
			return value;
		}
		if (this.take('sqrt')) {
			this.need('(');
			const value = this.expression();
			this.need(')');
			return { kind: 'unary', op: 'sqrt', value };
		}
		if (this.take('gcd')) {
			this.need('(');
			const left = this.expression();
			this.need(',');
			const right = this.expression();
			this.need(')');
			return { kind: 'gcd', left, right };
		}
		if (isName(t) && !reserved.has(t)) {
			this.i++;
			return { kind: 'name', name: t };
		}
		return this.error('Expected a number, name or bracket');
	}
	private unary(): Expr {
		if (this.take('-')) return { kind: 'unary', op: '-', value: this.unary() };
		if (this.take('+')) return { kind: 'unary', op: '+', value: this.unary() };
		let left = this.atom();
		if (this.take('^')) {
			const token = this.t;
			const right = this.unary();
			try {
				exponent(right);
			} catch {
				throw new ParseError(
					'Exponent must be a literal integer from -12 to 12',
					token.text,
					token.column,
					this.line
				);
			}
			left = { kind: 'binary', op: '^', left, right };
		}
		return left;
	}
	private product(): Expr {
		let left = this.unary();
		for (;;) {
			let op: '*' | '/' | undefined;
			if (this.take('*')) op = '*';
			else if (this.take('/')) op = '/';
			else if (
				this.t.text === '(' ||
				(isName(this.t.text) &&
					!['to', 'places', 'solve', 'expand', 'factor'].includes(this.t.text))
			)
				op = '*';
			if (!op) return left;
			left = { kind: 'binary', op, left, right: this.unary() };
		}
	}
	expression(): Expr {
		let left = this.product();
		while (this.t.text === '+' || this.t.text === '-') {
			const op = this.t.text as '+' | '-';
			this.i++;
			left = { kind: 'binary', op, left, right: this.product() };
		}
		return left;
	}
	private equation(): Equation {
		const left = this.expression();
		this.need('=');
		return { left, right: this.expression() };
	}
	statement(): Statement {
		let result: Statement;
		if (this.take('solve')) {
			const equations = [this.equation()];
			while (this.take(',')) equations.push(this.equation());
			if (equations.length > 3) this.error('At most three equations');
			try {
				const vars =
					equations.length === 1 ? ['x'] : equations.length === 2 ? ['x', 'y'] : ['x', 'y', 'z'];
				for (const eq of equations)
					for (const side of [eq.left, eq.right]) {
						const d = degree(side, vars);
						if (equations.length > 1 && d > 1) this.error('System must be syntactically linear');
						for (const name of names(side))
							if (['x', 'y', 'z'].includes(name) && !vars.includes(name))
								this.error(`Unexpected unknown ${name}`);
					}
			} catch (e) {
				if (e instanceof ParseError) throw e;
				this.error((e as Error).message);
			}
			result = { kind: 'solve', equations };
		} else if (this.t.text === 'expand' || this.t.text === 'factor') {
			const kind = this.t.text;
			this.i++;
			const value = this.expression();
			try {
				degree(value);
			} catch (e) {
				if (e instanceof ParseError) throw e;
				this.error((e as Error).message);
			}
			result = { kind, value };
		} else {
			if (
				isName(this.t.text) &&
				!reserved.has(this.t.text) &&
				this.tokens[this.i + 1]?.text === '='
			) {
				const name = this.t.text;
				this.i += 2;
				if (['x', 'y', 'z'].includes(name)) this.error('Unknowns x, y, z cannot be assigned');
				result = { kind: 'assign', name, value: this.expression() };
			} else result = { kind: 'expression', value: this.expression() };
			if (this.take('to')) {
				if (!/^\d+$/.test(this.t.text) || Number(this.t.text) > 100)
					this.error('Decimal places must be an integer from 0 to 100');
				result.places = Number(this.t.text);
				this.i++;
				this.need('places');
			}
		}
		if (result.kind === 'solve' && this.take('to')) {
			if (this.t.text !== '6') this.error('Certified quadratic bounds currently require 6 places');
			result.places = 6;
			this.i++;
			this.need('places');
		}
		this.need('<end>');
		return result;
	}
}
export function parse(source: string): WorkOrder {
	const lines = source.trim().split(/\r?\n/);
	if (lines[0]?.trim() === '```sheet') {
		if (lines.at(-1)?.trim() !== '```')
			throw new ParseError('Missing closing sheet fence', '<end>', 1, lines.length);
		lines.shift();
		lines.pop();
	}
	const statements = lines.flatMap((line, i) =>
		line.trim() ? [new Parser(tokenize(line, i + 1), i + 1).statement()] : []
	);
	if (!statements.length) throw new ParseError('Empty work order', '<end>', 1);
	return { statements };
}
