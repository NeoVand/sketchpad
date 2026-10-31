import { TraceCalc, type Calc, type CalcCall } from './calc';
import { Arithmetic, CheckFailed, type Rational, type CheckMode } from './arithmetic';
import { expand, factor, solve, system, type AlgebraResult } from './algebra';
import { parse, type Statement, type WorkOrder } from './parse';
export interface StatementResult {
	statement: Statement;
	line: string;
	status: 'ok' | 'refused' | 'error';
	value?: Rational;
	algebra?: AlgebraResult;
	error?: string;
	trace: CalcCall[];
}
export interface RunResult {
	lines: string[];
	results: StatementResult[];
	trace: CalcCall[];
}
/** Fixed scheduler. Parsing errors throw with token locations; arithmetic failures become display lines. */
export interface RunOptions {
	checkMode?: CheckMode;
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
	for (const statement of work.statements) {
		const start = traced.calls.length;
		try {
			let value: Rational | undefined, algebra: AlgebraResult | undefined, text: string;
			if (statement.kind === 'expression' || statement.kind === 'assign') {
				value = await a.evaluate(statement.value, env, { places: statement.places });
				text = await a.decimal(value, statement.places ?? 12, statement.places !== undefined);
				if (statement.kind === 'assign') env.set(statement.name, value);
			} else {
				if (statement.kind === 'expand') algebra = await expand(a, statement.value, env);
				else if (statement.kind === 'factor') algebra = await factor(a, statement.value, env);
				else
					algebra =
						statement.equations.length === 1
							? await solve(a, statement.equations[0], env)
							: await system(a, statement.equations, env);
				algebra.checkMode = a.checkMode;
				text = algebra.text;
			}
			results.push({
				statement,
				line: `= ${text}`,
				status: 'ok',
				value,
				algebra,
				trace: traced.calls.slice(start)
			});
		} catch (e) {
			// A failed re-assignment must never leave an older value available to later lines.
			if (statement.kind === 'assign') env.delete(statement.name);
			const refused = e instanceof CheckFailed,
				error = e instanceof Error ? e.message : String(e);
			results.push({
				statement,
				line: refused ? '= check failed' : `= error: ${error}`,
				status: refused ? 'refused' : 'error',
				error,
				trace: traced.calls.slice(start)
			});
		}
	}
	return { lines: results.map((r) => r.line), results, trace: traced.calls };
}
