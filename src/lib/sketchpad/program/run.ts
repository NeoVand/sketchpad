import { TraceCalc, type Calc, type CalcCall } from './calc';
import { Arithmetic, CheckFailed, type Rational, type CheckMode } from './arithmetic';
import { expand, factor, solve, system, type AlgebraResult } from './algebra';
import { DerivationBuilder, type Derivation, type Quantity } from './derivation';
import { textbookExpand, textbookFactor, textbookSolve, textbookSystem } from './textbook';
import { parse, type Statement, type WorkOrder } from './parse';
export interface StatementResult {
	statement: Statement;
	line: string;
	status: 'ok' | 'refused' | 'error';
	value?: Rational;
	algebra?: AlgebraResult;
	error?: string;
	/** a refusal's failed check as TeX, when the check can say it */
	failedCheck?: string;
	trace: CalcCall[];
	derivation: Derivation;
}
export interface RunResult {
	lines: string[];
	results: StatementResult[];
	trace: CalcCall[];
}
/** Fixed scheduler. Parsing errors throw with token locations; arithmetic failures become display lines. */
export interface RunOptions {
	checkMode?: CheckMode;
	path?: 'textbook' | 'evaluation';
	/** Opt into the retained certified six-place quadratic brackets. */
	places?: 6;
	/** Compute the optional decimal display after the exact radical answer (default true). */
	approximate?: boolean;
	/**
	 * Places for a statement that asks for none, in place of the 12 every ÷ and √ is otherwise cut at: ÷ then stays
	 * exact, a result whose decimal ends within these places is that decimal (`= 12.5`), and any other is its exact
	 * fraction with the decimal cut here (`= 2375/12 (≈ 197.9166…)`); an irrational √ is cut here. The chat's sheet blocks run with 4, so a block like
	 * `2375 ÷ 12` costs seconds, not minutes; a statement's own `to k places` keeps k.
	 */
	defaultPlaces?: number;
}
export async function run(
	source: string | WorkOrder,
	calc: Calc,
	options: RunOptions = {}
): Promise<RunResult> {
	const work = typeof source === 'string' ? parse(source) : source;
	const traced = new TraceCalc(calc),
		a = new Arithmetic(traced, options.checkMode),
		env = new Map<string, Rational>();
	const results: StatementResult[] = [];
	const known = new Map<string, Quantity>();
	for (const statement of work.statements) {
		const start = traced.calls.length,
			b = new DerivationBuilder(
				traced,
				a.checkMode,
				env,
				`d${results.length}`,
				options.path ?? 'textbook',
				[...known.values()],
				statement.kind === 'solve' ? (statement.places ?? options.places) : options.places,
				options.approximate ?? true
			);
		try {
			let value: Rational | undefined, algebra: AlgebraResult | undefined, text: string;
			if (statement.kind === 'expression' || statement.kind === 'assign') {
				b.line('given', (r) => r(statement.value), { given: statement.value });
				const fallback = statement.places === undefined ? options.defaultPlaces : undefined;
				const computed = await b.compute((a) =>
					a.evaluate(statement.value, env, {
						places: statement.places,
						rational: fallback !== undefined,
						cut: fallback
					})
				);
				value = computed.value;
				if (!value.approximate) b.identity('result', statement.value, b.expr(computed));
				else
					b.line(
						'result',
						(r) => `${r(statement.value)} \\approx ${r(b.expr(computed))}`,
						{ approximation: { expression: statement.value, value, places: statement.places } },
						'Decimal arithmetic uses the requested per-operation precision'
					);
				if (fallback === undefined)
					text = await a.decimal(value, statement.places ?? 12, statement.places !== undefined);
				else {
					// a decimal that ends within the places is the answer; one that does not keeps its exact fraction
					const shown = await a.decimal(value, fallback);
					text =
						shown.endsWith('…') && value.d !== 1n && !value.approximate
							? `${value.n}/${value.d} (≈ ${shown})`
							: shown;
				}
				if (statement.kind === 'assign') {
					env.set(statement.name, value);
					known.set(statement.name, computed);
				}
			} else {
				if (options.path !== 'evaluation') {
					if (statement.kind === 'expand') algebra = await textbookExpand(b, statement.value);
					else if (statement.kind === 'factor') algebra = await textbookFactor(b, statement.value);
					else
						algebra =
							statement.equations.length === 1
								? await textbookSolve(b, statement.equations[0])
								: await textbookSystem(b, statement.equations);
				} else if (statement.kind === 'expand') algebra = await expand(a, statement.value, env);
				else if (statement.kind === 'factor') algebra = await factor(a, statement.value, env);
				else
					algebra =
						statement.equations.length === 1
							? await solve(a, statement.equations[0], env)
							: await system(a, statement.equations, env);
				algebra.checkMode = a.checkMode;
				for (const approximation of b.pendingApproximations) {
					try {
						algebra.text += await approximation();
					} catch (e) {
						algebra.approximationError = e instanceof Error ? e.message : String(e);
					}
				}
				text = algebra.text;
			}
			results.push({
				statement,
				line: `= ${text}`,
				status: 'ok',
				value,
				algebra,
				trace: traced.calls.slice(start),
				derivation: b.derivation
			});
		} catch (e) {
			// A failed re-assignment must never leave an older value available to later lines.
			if (statement.kind === 'assign') {
				env.delete(statement.name);
				known.delete(statement.name);
			}
			const refused = e instanceof CheckFailed,
				error = e instanceof Error ? e.message : String(e);
			results.push({
				statement,
				line: refused ? '= check failed' : `= error: ${error}`,
				status: refused ? 'refused' : 'error',
				error,
				failedCheck: e instanceof CheckFailed ? e.check : undefined,
				trace: traced.calls.slice(start),
				derivation: { ...b.derivation, lines: b.derivation.lines.filter((l) => l.kind === 'given') }
			});
		}
	}
	return { lines: results.map((r) => r.line), results, trace: traced.calls };
}
