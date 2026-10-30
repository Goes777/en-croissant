import { Chess, normalizeMove } from "chessops/chess";
import { makeFen } from "chessops/fen";
import { parseSan } from "chessops/san";
import { makeUci } from "chessops";
import { type Exercise, exerciseSchema } from "./model";
import { positionFromExercise, validateExercise } from "./grader";

function after(san: string[]) {
    const position = Chess.default();
    for (const token of san) {
        const move = parseSan(position, token);
        if (!move) throw new Error("Lance inválido no exemplo: " + token);
        position.play(move);
    }
    return makeFen(position.toSetup());
}
function base(
    id: string,
    title: string,
    prompt: string,
    fen: string,
    explanation: string,
    tags: string[],
): Exercise {
    return exerciseSchema.parse({
        id: "chesspratica-intro:" + id,
        kind: "find-move",
        title,
        prompt,
        startFen: fen,
        explanation,
        tags,
        status: "validated",
        version: 1,
        courseTitle: "Fundamentos guiados",
        exerciseFamilyId: id,
        sourceAnchorIds: ["original:chesspratica:" + id],
    });
}
const tacticalData: [string, string, string, string, string, string[], boolean?][] = [
    [
        "t1",
        "Mate em f7",
        "Encontre o mate em um lance.",
        after(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"]),
        "Qxf7# explora a ação conjunta da dama e do bispo em c4. A casa f7 tinha apenas a defesa do rei.",
        ["Mate", "Coordenação"],
        true,
    ],
    [
        "t2",
        "Diagonais do rei",
        "As pretas jogam. Encontre o mate em um lance.",
        after(["f3", "e5", "g4"]),
        "Qh4# utiliza a diagonal h4–e1 aberta pelos avanços dos peões brancos.",
        ["Mate", "Diagonais"],
        true,
    ],
    [
        "t3",
        "Última fileira",
        "Encontre o mate com a torre.",
        "6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1",
        "Re8# controla a oitava fileira. Os próprios peões bloqueiam as casas de fuga do rei preto.",
        ["Mate", "Última fileira"],
        true,
    ],
    [
        "t4",
        "Garfo de cavalo",
        "Dê xeque e ataque a dama com o mesmo lance.",
        "4k3/8/8/3N3q/8/8/8/4K3 w - - 0 1",
        "Nf6+ ataca simultaneamente o rei em e8 e a dama em h5. O xeque obriga a resolver primeiro a ameaça ao rei.",
        ["Garfo", "Cavalo"],
    ],
    [
        "t5",
        "Cravada absoluta",
        "Crave o cavalo ao rei preto.",
        "4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1",
        "Bb5 coloca bispo, cavalo e rei na diagonal b5–e8. O cavalo não pode sair expondo o rei.",
        ["Cravada", "Bispo"],
    ],
    [
        "t6",
        "Xeque duplo",
        "Mova o bispo para dar xeque com duas peças ao mesmo tempo.",
        "4k3/8/8/8/8/8/4B3/4R1K1 w - - 0 1",
        "Bb5+ abre a coluna e para a torre e também ataca o rei pela diagonal b5–e8. Em xeque duplo, o rei precisa mover-se.",
        ["Ataque descoberto", "Xeque duplo"],
    ],
    [
        "t7",
        "Diagonal longa",
        "Capture a dama sem perder seu próprio rei.",
        "q6k/8/8/8/8/8/6B1/6K1 w - - 0 1",
        "Bxa8 captura a dama na diagonal g2–a8, que está livre. Verificar todo o trajeto evita capturas imaginárias através de peças.",
        ["Cálculo", "Ganho de material"],
    ],
    [
        "t8",
        "Promoção",
        "Promova o peão a dama dando xeque.",
        "7k/P7/8/8/8/8/8/7K w - - 0 1",
        "a8=Q+ transforma o peão em dama e ataca o rei na oitava fileira.",
        ["Promoção", "Final"],
    ],
    [
        "t9",
        "Interposição",
        "Seu rei está em xeque. Bloqueie o ataque com a torre.",
        "4r2k/8/8/8/8/8/3R4/4K3 w - - 0 1",
        "Re2 interpõe a torre entre a torre preta em e8 e o rei em e1. Um lance ofensivo que ignore esse xeque seria ilegal.",
        ["Defesa", "Interposição"],
    ],
    [
        "t10",
        "Evitar afogamento",
        "Promova a torre para evitar o afogamento que ocorreria com a promoção a dama.",
        "8/k1P5/2K5/8/8/8/8/8 w - - 0 1",
        "c8=R mantém uma casa de fuga para o rei preto. c8=Q deixaria o rei sem lances legais e sem estar em xeque, produzindo empate por afogamento.",
        ["Subpromoção", "Afogamento"],
    ],
];
const moves = ["Qxf7#", "Qh4#", "Re8#", "Nf6+", "Bb5", "Bb5+", "Bxa8", "a8=Q+", "Re2", "c8=R"];
const tactics = tacticalData.map(([id, title, prompt, fen, explanation, tags, mate], index) => {
    const position = positionFromExercise(fen),
        move = parseSan(position, moves[index]);
    if (!move) throw new Error("Solução inválida: " + title);
    return validateExercise({
        ...base(id, title, prompt, fen, explanation, tags),
        kind: index === 7 || index === 9 ? "endgame-technique" : "find-move",
        acceptedLinesUci: [[makeUci(normalizeMove(position, move))]],
        goal: mate ? "checkmate" : "line",
        hints: ["Observe as peças ativas e a segurança dos dois reis.", explanation],
        exerciseFamilyId: mate ? "mate-em-um" : id,
    });
});

const strategyData: {
    id: string;
    title: string;
    fen: string;
    prompt: string;
    tags: string[];
    explanation: string;
    options?: [string, string, string][];
    answers?: string[];
    kind?: Exercise["kind"];
    rubric?: Exercise["rubric"];
}[] = [
    {
        id: "s1",
        title: "Dois planos de desenvolvimento",
        fen: after(["e4", "e5", "Nf3", "Nc6"]),
        prompt: "Selecione os dois planos justificáveis nesta posição, sem procurar uma vitória forçada.",
        tags: ["Desenvolvimento", "Planos"],
        explanation:
            "Desenvolver o bispo e preparar o roque melhora a segurança. Preparar d4 para disputar o centro também é um plano justificável. A ordem exata depende das respostas pretas.",
        options: [
            [
                "develop",
                "Desenvolver o bispo e preparar o roque",
                "Melhora a segurança e coloca uma peça em jogo.",
            ],
            [
                "center",
                "Preparar d4 para disputar o centro",
                "A ruptura central é um objetivo estratégico legítimo.",
            ],
            [
                "queen",
                "Mover a dama várias vezes sem ameaça concreta",
                "Pode perder tempos de desenvolvimento.",
            ],
        ],
        answers: ["develop", "center"],
    },
    {
        id: "s2",
        title: "Cadeia de peões francesa",
        fen: after(["e4", "e6", "d4", "d5", "e5", "c5", "c3", "Nc6"]),
        prompt: "Qual plano conserva a base da cadeia branca?",
        tags: ["Estrutura de peões", "Centro"],
        explanation:
            "A base d4 é o alvo do contrajogo preto com c5 e Nc6. Desenvolver peças e sustentar d4 mantém a cadeia, sem supor que toda troca no centro seja ruim.",
        options: [
            [
                "base",
                "Sustentar d4 e desenvolver as peças",
                "O plano considera o alvo concreto da pressão preta.",
            ],
            [
                "wing",
                "Avançar todos os peões do rei antes de desenvolver",
                "Cria fraquezas e não responde à pressão central.",
            ],
        ],
        answers: ["base"],
    },
    {
        id: "s3",
        title: "Controle de d5",
        fen: after(["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"]),
        prompt: "Explique por que a casa d5 pode ser importante e o que você verificaria antes de ocupá-la.",
        kind: "strategy-explain",
        tags: ["Casas fracas", "Cálculo"],
        explanation:
            "Uma casa só é útil como posto avançado se a peça puder permanecer nela e contribuir. Verifique a ruptura e6/e5, trocas disponíveis e apoio de outras peças.",
        rubric: [
            {
                criterion: "Apoio e contestação",
                explanation:
                    "Identificar quais peões e peças controlam d5, sem declarar a casa permanentemente fraca.",
            },
            {
                criterion: "Plano concreto",
                explanation:
                    "Propor preparação e verificar respostas adversárias antes de ocupar a casa.",
            },
        ],
    },
    {
        id: "s4",
        title: "Ataque de minoria",
        fen: after(["d4", "d5", "c4", "e6", "Nc3", "Nf6", "cxd5", "exd5"]),
        prompt: "Qual plano típico busca criar alvos na ala da dama?",
        tags: ["Estrutura de peões", "Planos"],
        explanation:
            "O avanço b4–b5 é um plano de minoria conhecido nessa estrutura. Ele procura provocar fraquezas futuras; ainda exige desenvolvimento, segurança do rei e cálculo das respostas.",
        options: [
            [
                "minority",
                "Preparar b4–b5 para provocar alvos",
                "É um plano estrutural, e não uma sequência forçada imediata.",
            ],
            [
                "sacrifice",
                "Sacrificar uma peça sem calcular as respostas",
                "A estrutura, sozinha, não justifica um sacrifício.",
            ],
        ],
        answers: ["minority"],
    },
    {
        id: "s5",
        title: "Reis e oposição",
        fen: "8/4k3/8/4K3/4P3/8/8/8 w - - 0 1",
        prompt: "Avalie a importância da vez de jogar e da oposição neste final. Não dê um resultado sem justificativa.",
        kind: "position-evaluation",
        tags: ["Finais posicionais", "Oposição"],
        explanation:
            "Oposição e casas de acesso são mais informativas que apenas contar peões. Analise as casas de entrada e como o lado a jogar altera a possibilidade de avançar o rei.",
        rubric: [
            {
                criterion: "Vez e acesso",
                explanation:
                    "Identificar o lado a jogar e discutir casas de entrada para o rei branco.",
            },
            {
                criterion: "Justificativa",
                explanation:
                    "Relacionar oposição ao avanço do peão, sem confundir um princípio com uma variante provada.",
            },
        ],
    },
    {
        id: "s6",
        title: "Bispo e peões fixos",
        fen: "6k1/5ppp/8/3p4/3P4/2P5/5PPP/2B3K1 w - - 0 1",
        prompt: "Explique como melhorar o bispo branco e quais limitações os peões fixos impõem.",
        kind: "strategy-explain",
        tags: ["Peças boas e ruins", "Coordenação"],
        explanation:
            "Os peões c3 e d4 ocupam casas da mesma cor do bispo de c1. Isso sugere limitações em torno da cadeia, mas o bispo ainda pode procurar diagonais ativas. Avalie mobilidade real antes de rotulá-lo como inútil.",
        rubric: [
            {
                criterion: "Cor e estrutura",
                explanation: "Relacionar a cor das casas dos peões ao alcance do bispo.",
            },
            {
                criterion: "Melhoria",
                explanation:
                    "Propor uma diagonal ativa ou troca favorável, reconhecendo a mobilidade que ainda existe.",
            },
        ],
    },
    {
        id: "s7",
        title: "Colunas abertas",
        fen: "r5k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
        prompt: "Qual princípio orienta uma melhoria da torre branca?",
        tags: ["Colunas abertas", "Atividade"],
        explanation:
            "Ocupar uma coluna aberta pode facilitar a invasão. Aqui há mais de uma coluna disponível; não se pode declarar uma única melhor coluna sem considerar o plano e as respostas pretas.",
        options: [
            [
                "file",
                "Procurar coluna aberta e casa de entrada",
                "Relaciona atividade da torre a objetivos concretos.",
            ],
            [
                "pawn",
                "Deixar a torre passiva e jogar apenas com peões",
                "Ignora a principal peça ativa da posição.",
            ],
        ],
        answers: ["file"],
    },
    {
        id: "s8",
        title: "Posto avançado em e5",
        fen: "6k1/pp4pp/8/3p1p2/3P4/5N2/PP3PPP/6K1 w - - 0 1",
        prompt: "Qual ideia aproveita a estrutura de peões?",
        tags: ["Posto avançado", "Cavalo"],
        explanation:
            "Ne5 ocupa uma casa apoiada pelo peão d4. Os peões pretos d5 e f5 já passaram pelas casas de onde poderiam expulsar o cavalo de e5. Isso é uma base estrutural; outras peças adversárias ainda podem contestá-lo.",
        options: [
            [
                "outpost",
                "Considerar Ne5, apoiado pelo peão d4",
                "A casa tem apoio e não pode ser atacada pelos peões d5 e f5.",
            ],
            [
                "edge",
                "Levar o cavalo para a borda sem objetivo",
                "Não explora o apoio oferecido pela estrutura.",
            ],
        ],
        answers: ["outpost"],
    },
    {
        id: "s9",
        title: "Profilaxia com h3",
        fen: after([
            "e4",
            "e5",
            "Nf3",
            "Nc6",
            "Bb5",
            "a6",
            "Ba4",
            "Nf6",
            "O-O",
            "Be7",
            "Re1",
            "b5",
            "Bb3",
            "d6",
            "c3",
            "O-O",
        ]),
        prompt: "Explique a ideia de h3 nesta posição, seus benefícios e seu custo.",
        kind: "strategy-explain",
        tags: ["Profilaxia", "Planos"],
        explanation:
            "h3 controla g4 e reduz a possibilidade de uma cravada com Bg4, o que pode ajudar na preparação de d4. O lance custa um tempo e altera a cobertura de peões; profilaxia deve responder a uma ideia real.",
        rubric: [
            {
                criterion: "Ideia adversária",
                explanation: "Identificar a possibilidade de Bg4 e a importância de g4.",
            },
            {
                criterion: "Custo e contexto",
                explanation:
                    "Relacionar o lance a d4 e reconhecer que ele não ganha material nem é obrigatório em qualquer posição.",
            },
        ],
    },
    {
        id: "s10",
        title: "Pré-requisitos de um plano",
        fen: after(["e4", "e5", "Nf3", "Nc6"]),
        prompt: "Ordene este plano específico: preparar e realizar o roque curto e depois centralizar a torre que terminou em f1.",
        kind: "strategy-plan-order",
        tags: ["Segurança do rei", "Coordenação"],
        explanation:
            "Primeiro o bispo precisa liberar f1. O roque então coloca o rei em g1 e a torre em f1. Só depois essa torre pode ocupar uma coluna central. É uma ordem de pré-requisitos, não uma receita que dispensa calcular os lances adversários.",
        options: [
            ["bishop", "Desenvolver o bispo de f1", "Libera a casa necessária ao roque."],
            [
                "castle",
                "Fazer o roque curto quando for legal e seguro",
                "Leva o rei a g1 e a torre a f1.",
            ],
            ["rook", "Centralizar a torre que veio para f1", "Depende do roque realizado."],
        ],
        answers: ["bishop", "castle", "rook"],
    },
];
const strategy = strategyData.map((item) =>
    validateExercise({
        ...base(item.id, item.title, item.prompt, item.fen, item.explanation, item.tags),
        kind: item.kind ?? "strategy-plan-mcq",
        options:
            item.options?.map(([id, label, explanation]) => ({ id, label, explanation })) ?? [],
        acceptedAnswerIds: item.answers ?? [],
        rubric: item.rubric ?? [],
        hints: ["Observe a estrutura, as peças menos ativas e as possibilidades do adversário."],
    }),
);
export const introductoryExercises: Exercise[] = [...tactics, ...strategy].map(
    (exercise, index) => ({ ...exercise, order: index }),
);
