/**
 * The paper's skeleton, section by section: what each will hold and what it waits on. The writing plan with sources is
 * paper/OUTLINE.md; this list is what the site shows until the text exists.
 */
export interface Section {
	id: string;
	title: string;
	/** what the section will say */
	holds: string;
	/** the result it waits on, or null when its material exists today */
	waits: string | null;
}

export const TITLE =
	'Sketchpad: a small vision-language model that computes exactly on its own sheet';

export const SECTIONS: Section[] = [
	{
		id: 'intro',
		title: 'Introduction',
		holds:
			'Language models get long arithmetic wrong, and tools move the work out of the model. We keep it inside: the model reads a rendered sheet three cells at a time and writes every digit, one forward pass per step, and a fixed runtime only paints and moves. The opening figure shows the sheet, one view and the certificate.',
		waits: null
	},
	{
		id: 'machine',
		title: 'The sheet machine',
		holds:
			'Views, steps and the runtime. Placeholder slots read a multiply step in one forward pass; waves run the passes of a multiplication as one batch. The sheet is the only state.',
		waits: null
	},
	{
		id: 'certificate',
		title: 'Certification',
		holds:
			'Exactness at every step of every run of any length is equivalent to exactness on the finite set of views (Theorem P, sheet form), and no finite test suffices once state leaves the sheet. All 2,446 views certified with their margins; every visitor’s GPU re-checks the weakest tenth; fp16 against q4 on device.',
		waits: null
	},
	{
		id: 'calculator',
		title: 'A calculator on the sheet',
		holds:
			'Five digit tables: add, multiply, subtract, guess a quotient digit, lower the guess. Long division by Knuth’s Algorithm D, square root digit by digit, gcd and signed numbers as layout over them.',
		waits: 'the published model’s 200 on-device runs (under way)'
	},
	{
		id: 'algebra',
		title: 'Algebra by evaluation',
		holds:
			'Equations solved by evaluating the typed sides at a few numbers and reading the polynomial off the values; (x + 2)^5 expanded as 1002^5 (Kronecker substitution); systems by Cramer’s rule and Bareiss elimination; factoring by guess, then prove. Every arithmetic step is certified; what is not is said once.',
		waits: 'the work-order runtime under 12 s per problem; on-device runs'
	},
	{
		id: 'one-model',
		title: 'One model that decides',
		holds:
			'A gate in the graph: at 0 the model is stock Qwen3.5-0.8B, at 1 the sheet machine. The model writes a work order mid-reply, the sheet runs it, and the answer returns into the reply. Retention by self-distillation, measured on instruction-following, not perplexity alone.',
		waits: 'the chat fine-tune against its registered thresholds'
	},
	{
		id: 'inside',
		title: 'Inside the model',
		holds:
			'The logit lens per layer, the state that writes each answer, and a push at layer 20 that changes the next step on the visitor’s own GPU.',
		waits: null
	},
	{
		id: 'related',
		title: 'Related work',
		holds:
			'Neural GPU, Wei’s cellular automaton and DFST for exact arithmetic; Cai et al. for proving learned programs on finite inputs; CAEF for procedure-stepping LLMs; Lample and Charton and Minerva for algebra; Toolformer, ToRA and ReTool for deciding when to call; progressive networks and X-LoRA for gates; Moore’s experiments on sequential machines.',
		waits: null
	},
	{
		id: 'limits',
		title: 'Limits',
		holds:
			'What is not certified (the work order, which procedure runs, the runtime’s layout), speed on a laptop GPU, and the scope: integers and decimals, polynomials of small degree.',
		waits: null
	}
];
