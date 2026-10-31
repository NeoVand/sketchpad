// Lets node run the app's TypeScript as it is: the program folder imports './calc' without an extension (Vite resolves
// it) and uses parameter properties, which node's type stripping refuses. A relative import that does not resolve is
// tried again with '.ts', and every .ts file is transpiled with the project's own TypeScript (no type checking).
//
//     node --import ./paper/figures/ts-resolve.mjs paper/figures/algebra.ts
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const ts = createRequire(import.meta.url)('typescript');

registerHooks({
	resolve(spec, ctx, next) {
		try {
			return next(spec, ctx);
		} catch (e) {
			if ((spec.startsWith('./') || spec.startsWith('../')) && !/\.[cm]?[jt]s$/.test(spec))
				return next(spec + '.ts', ctx);
			throw e;
		}
	},
	load(url, ctx, next) {
		if (!url.startsWith('file:') || !url.endsWith('.ts')) return next(url, ctx);
		const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
			fileName: fileURLToPath(url),
			compilerOptions: {
				module: ts.ModuleKind.ESNext,
				target: ts.ScriptTarget.ES2022,
				useDefineForClassFields: true,
				verbatimModuleSyntax: false
			}
		}).outputText;
		return { format: 'module', source, shortCircuit: true };
	}
});
