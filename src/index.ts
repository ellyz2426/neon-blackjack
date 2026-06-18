import {
	World,
	createSystem,
	PanelUI,
	PanelDocument,
	UIKitDocument,
	UIKit,
	Follower,
	ScreenSpace,
	eq,
	BoxGeometry,
	MeshStandardMaterial,
	MeshBasicMaterial,
	Mesh,
	Group,
	SphereGeometry,
	PlaneGeometry,
	LineSegments,
	BufferGeometry,
	Float32BufferAttribute,
	LineBasicMaterial,
	Color,
	Vector3,
	Raycaster,
	Vector2,
	AdditiveBlending,
	FogExp2,
	TorusGeometry,
	CylinderGeometry,
	PointLight,
	AmbientLight,
	Object3D,
	InputComponent,
	DoubleSide,
	RingGeometry,
} from '@iwsdk/core';

// ===== TYPES =====
type GameState = 'title' | 'modeSelect' | 'betting' | 'dealing' | 'playerTurn' | 'dealerTurn' | 'resolving' | 'gameover' | 'paused' | 'leaderboard' | 'achievements' | 'stats' | 'skins' | 'settings' | 'help';
type GameMode = 'classic' | 'speed' | 'highstakes' | 'counting' | 'daily' | 'survival' | 'tournament' | 'practice';
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
	suit: Suit;
	rank: Rank;
	value: number;
	mesh?: Group;
	faceUp: boolean;
}

interface Hand {
	cards: Card[];
	bet: number;
	doubled: boolean;
	surrendered: boolean;
	stood: boolean;
	busted: boolean;
	blackjack: boolean;
	splitAces: boolean;
}

interface LeaderboardEntry {
	score: number;
	mode: string;
	date: string;
	hands: number;
}

interface Achievement {
	id: string;
	name: string;
	desc: string;
	check: () => boolean;
}

// ===== CONSTANTS =====
const CARD_W = 0.12;
const CARD_H = 0.168;
const CARD_D = 0.003;
const TABLE_Y = 0.92;
const TABLE_Z = -1.4;
const PLAYER_Y = TABLE_Y + 0.01;
const DEALER_Y = TABLE_Y + 0.01;
const PLAYER_Z = TABLE_Z + 0.35;
const DEALER_Z = TABLE_Z - 0.25;
const CARD_SPACING = 0.08;

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES: Record<Rank, number> = {
	'A': 11, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10,
};

const SUIT_COLORS: Record<Suit, number> = {
	hearts: 0xff3344, diamonds: 0xff3344, clubs: 0xcccccc, spades: 0xcccccc,
};

const SUIT_SYMBOLS: Record<Suit, string> = {
	hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S',
};

const THEMES = [
	{ name: 'Neon Holodeck', accent: 0x00e5ff, table: 0x003322, felt: 0x004433, bg: 0x000a0a, fog: 0x000808, wall: 0x001414, cardBack: 0x0044aa },
	{ name: 'Crimson Casino', accent: 0xff3344, table: 0x330011, felt: 0x440015, bg: 0x0a0000, fog: 0x080000, wall: 0x140000, cardBack: 0xaa0022 },
	{ name: 'Golden Royale', accent: 0xffaa00, table: 0x332200, felt: 0x443300, bg: 0x0a0500, fog: 0x080400, wall: 0x140a00, cardBack: 0xaa8800 },
	{ name: 'Void Lounge', accent: 0x9933ff, table: 0x110033, felt: 0x1a0044, bg: 0x05000a, fog: 0x040008, wall: 0x0a0014, cardBack: 0x6600aa },
	{ name: 'Emerald Table', accent: 0x00ff88, table: 0x003300, felt: 0x004400, bg: 0x000a00, fog: 0x000800, wall: 0x001400, cardBack: 0x008844 },
];

const MODE_NAMES: Record<GameMode, string> = {
	classic: 'Classic', speed: 'Speed Round', highstakes: 'High Stakes',
	counting: 'Counting Trainer', daily: 'Daily Challenge', survival: 'Survival',
	tournament: 'Tournament', practice: 'Practice',
};

const SKIN_COLORS = [0x0044aa, 0xaa0022, 0x008844, 0x6600aa, 0xaa8800, 0xffffff, 0xff6600, 0x4444cc];
const SKIN_NAMES = ['Classic Blue', 'Crimson Red', 'Emerald Green', 'Royal Purple', 'Golden Ace', 'Diamond White', 'Blaze Orange', 'Void Indigo'];
const SKIN_UNLOCK_WINS = [0, 5, 15, 30, 50, 75, 100, 150];

const LEVEL_TITLES = [
	'Newbie', 'Rookie', 'Beginner', 'Apprentice', 'Regular', 'Skilled', 'Expert',
	'Veteran', 'Pro', 'Master', 'Grandmaster', 'Legend', 'Champion', 'Elite', 'Ace',
];
const XP_PER_LEVEL = 500;

// ===== PERSISTENCE =====
const STORAGE_KEY = 'neon_bj_';
function loadData<T>(key: string, def: T): T {
	try { const v = localStorage.getItem(STORAGE_KEY + key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function saveData(key: string, val: unknown) {
	try { localStorage.setItem(STORAGE_KEY + key, JSON.stringify(val)); } catch { /* noop */ }
}

// ===== AUDIO =====
class AudioManager {
	private ctx: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private sfxGain: GainNode | null = null;
	private musicGain: GainNode | null = null;
	private droneOscs: OscillatorNode[] = [];
	masterVol = 0.7; sfxVol = 0.8; musicVol = 0.3;

	init() {
		if (this.ctx) return;
		this.ctx = new AudioContext();
		this.masterGain = this.ctx.createGain();
		this.masterGain.gain.value = this.masterVol;
		this.masterGain.connect(this.ctx.destination);
		this.sfxGain = this.ctx.createGain();
		this.sfxGain.gain.value = this.sfxVol;
		this.sfxGain.connect(this.masterGain);
		this.musicGain = this.ctx.createGain();
		this.musicGain.gain.value = this.musicVol;
		this.musicGain.connect(this.masterGain);
	}

	startDrone() {
		if (!this.ctx || !this.musicGain || this.droneOscs.length > 0) return;
		const freqs = [65.41, 98, 130.81];
		for (let i = 0; i < 3; i++) {
			const osc = this.ctx.createOscillator();
			const g = this.ctx.createGain();
			const lp = this.ctx.createBiquadFilter();
			osc.type = i === 0 ? 'sine' : 'triangle';
			osc.frequency.value = freqs[i];
			g.gain.value = i === 0 ? 0.12 : 0.06;
			lp.type = 'lowpass'; lp.frequency.value = 300;
			osc.connect(g).connect(lp).connect(this.musicGain!);
			osc.start();
			this.droneOscs.push(osc);
		}
	}

	private tone(freq: number, type: OscillatorType, dur: number, vol = 0.12) {
		if (!this.ctx || !this.sfxGain) return;
		const osc = this.ctx.createOscillator();
		const g = this.ctx.createGain();
		osc.type = type; osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.04);
		g.gain.value = vol;
		g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
		osc.connect(g).connect(this.sfxGain);
		osc.start(); osc.stop(this.ctx.currentTime + dur);
	}

	playClick() { this.tone(1000, 'sine', 0.04, 0.08); }
	playDeal() { this.tone(800, 'triangle', 0.06, 0.1); }
	playHit() { this.tone(660, 'sine', 0.08, 0.1); setTimeout(() => this.tone(880, 'triangle', 0.06, 0.06), 30); }
	playBust() { this.tone(200, 'sawtooth', 0.25, 0.12); this.tone(150, 'square', 0.3, 0.08); }
	playWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 'sine', 0.2, 0.12), i * 80)); }
	playBlackjack() { [659, 784, 988, 1175, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 'sine', 0.25, 0.14), i * 70)); }
	playLose() { [440, 392, 349, 294].forEach((f, i) => setTimeout(() => this.tone(f, 'triangle', 0.25, 0.1), i * 100)); }
	playPush() { this.tone(440, 'sine', 0.15, 0.08); this.tone(440, 'triangle', 0.2, 0.06); }
	playChip() { this.tone(2000, 'sine', 0.03, 0.06); this.tone(3000, 'sine', 0.02, 0.04); }
	playSplit() { this.tone(660, 'sine', 0.1, 0.1); this.tone(990, 'sine', 0.12, 0.08); }
	playDouble() { this.tone(880, 'triangle', 0.1, 0.12); this.tone(1320, 'sine', 0.12, 0.08); }
	playAchievement() { [660, 784, 880, 1047, 1320].forEach((f, i) => setTimeout(() => this.tone(f, 'sine', 0.15, 0.1), i * 50)); }
	playLevelUp() { [440, 554, 659, 880, 1047, 1320].forEach((f, i) => setTimeout(() => this.tone(f, 'sine', 0.2, 0.12), i * 70)); }
	updateVolumes() {
		if (this.masterGain) this.masterGain.gain.value = this.masterVol;
		if (this.sfxGain) this.sfxGain.gain.value = this.sfxVol;
		if (this.musicGain) this.musicGain.gain.value = this.musicVol;
	}
}

// ===== PARTICLES =====
interface Particle { mesh: Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number; }

class ParticlePool {
	particles: Particle[] = [];
	private scene: Object3D;
	constructor(scene: Object3D, count = 100) {
		this.scene = scene;
		const geo = new SphereGeometry(0.005, 4, 4);
		for (let i = 0; i < count; i++) {
			const mat = new MeshBasicMaterial({ color: 0x00ffff, transparent: true, blending: AdditiveBlending });
			const mesh = new Mesh(geo, mat);
			mesh.visible = false;
			scene.add(mesh);
			this.particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0 });
		}
	}

	burst(x: number, y: number, z: number, color: number, count = 10) {
		let spawned = 0;
		for (const p of this.particles) {
			if (p.life > 0 || spawned >= count) continue;
			p.mesh.position.set(x, y, z);
			p.vx = (Math.random() - 0.5) * 1.2;
			p.vy = Math.random() * 1.5 + 0.3;
			p.vz = (Math.random() - 0.5) * 1.2;
			p.life = 0.5 + Math.random() * 0.4;
			p.maxLife = p.life;
			(p.mesh.material as MeshBasicMaterial).color.set(color);
			p.mesh.visible = true;
			spawned++;
		}
	}

	update(dt: number) {
		for (const p of this.particles) {
			if (p.life <= 0) continue;
			p.life -= dt;
			p.mesh.position.x += p.vx * dt;
			p.mesh.position.y += p.vy * dt;
			p.mesh.position.z += p.vz * dt;
			p.vy -= 2.5 * dt;
			const t = Math.max(0, p.life / p.maxLife);
			(p.mesh.material as MeshBasicMaterial).opacity = t;
			p.mesh.scale.setScalar(t);
			if (p.life <= 0) p.mesh.visible = false;
		}
	}
}

// ===== SHOE (DECK) MANAGER =====
class Shoe {
	cards: Card[] = [];
	dealt: Card[] = [];
	numDecks: number;

	constructor(numDecks = 6) {
		this.numDecks = numDecks;
		this.shuffle();
	}

	shuffle() {
		this.cards = [];
		this.dealt = [];
		for (let d = 0; d < this.numDecks; d++) {
			for (const suit of SUITS) {
				for (const rank of RANKS) {
					this.cards.push({ suit, rank, value: RANK_VALUES[rank], faceUp: false });
				}
			}
		}
		// Fisher-Yates
		for (let i = this.cards.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
		}
	}

	deal(): Card {
		if (this.cards.length < 20) this.shuffle();
		const card = this.cards.pop()!;
		this.dealt.push(card);
		return { ...card };
	}

	get remaining() { return this.cards.length; }
	get totalCards() { return this.numDecks * 52; }
	get decksRemaining() { return this.remaining / 52; }

	// Hi-Lo count
	getRunningCount(): number {
		let count = 0;
		for (const c of this.dealt) {
			const v = RANK_VALUES[c.rank];
			if (v >= 10 || c.rank === 'A') count--;
			else if (v <= 6) count++;
		}
		return count;
	}

	getTrueCount(): number {
		const dr = this.decksRemaining;
		return dr > 0 ? this.getRunningCount() / dr : 0;
	}
}

// ===== HAND UTILS =====
function handValue(cards: Card[]): number {
	let total = 0, aces = 0;
	for (const c of cards) {
		total += RANK_VALUES[c.rank];
		if (c.rank === 'A') aces++;
	}
	while (total > 21 && aces > 0) { total -= 10; aces--; }
	return total;
}

function isSoft(cards: Card[]): boolean {
	let total = 0, aces = 0;
	for (const c of cards) {
		total += RANK_VALUES[c.rank];
		if (c.rank === 'A') aces++;
	}
	while (total > 21 && aces > 1) { total -= 10; aces--; }
	return aces > 0 && total <= 21;
}

function handStr(cards: Card[]): string {
	const v = handValue(cards);
	return isSoft(cards) && v <= 21 && cards.length === 2 ? `Soft ${v}` : `${v}`;
}

function isBlackjack(cards: Card[]): boolean {
	return cards.length === 2 && handValue(cards) === 21;
}

function canSplit(hand: Hand): boolean {
	if (hand.cards.length !== 2) return false;
	return RANK_VALUES[hand.cards[0].rank] === RANK_VALUES[hand.cards[1].rank];
}

// ===== DAILY SEED =====
function getDailySeed(): number {
	const d = new Date();
	return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function seededRandom(seed: number): () => number {
	let s = seed;
	return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}


// ===== MAIN GAME SYSTEM =====
class BlackjackGame extends createSystem({
	titlePanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/title.json')] },
	modePanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/modeselect.json')] },
	bettingPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/betting.json')] },
	actionsPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/actions.json')] },
	hudPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hud.json')] },
	gameoverPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/gameover.json')] },
	pausePanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/pause.json')] },
	lbPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/leaderboard.json')] },
	achvPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achievements.json')] },
	statsPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
	skinsPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/skins.json')] },
	settingsPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
	helpPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/help.json')] },
	toastPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/toast.json')] },
	countingPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/counting.json')] },
	dealerInfoPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/dealerinfo.json')] },
}) {
	private audio = new AudioManager();
	private particles!: ParticlePool;
	private state: GameState = 'title';
	private prevState: GameState = 'title';
	private mode: GameMode = 'classic';
	private shoe!: Shoe;
	private numDecks = 6;

	// Player hands (supports split)
	private playerHands: Hand[] = [];
	private activeHandIdx = 0;
	private dealerCards: Card[] = [];

	// Betting
	private bank = 10000;
	private currentBet = 100;
	private lastBet = 100;
	private insuranceBet = 0;

	// State
	private winStreak = 0;
	private bestStreak = 0;
	private handsPlayed = 0;
	private dealTimer = 0;
	private dealQueue: { target: 'player' | 'dealer'; handIdx: number; faceUp: boolean }[] = [];
	private resolveTimer = 0;
	private speedTimer = 0;
	private speedTimeLimit = 15;

	// Survival
	private survivalLives = 3;

	// Tournament
	private tournamentRound = 0;
	private tournamentMaxRounds = 10;
	private tournamentScore = 0;

	// Counting trainer
	private showCount = false;

	// Visuals
	private themeIdx = 0;
	private skinIdx = 0;
	private cardMeshes: Group[] = [];
	private tableGroup!: Group;
	private cardGroup!: Group;

	// Panels
	private panelEntities: Map<string, { entity: any; doc: UIKitDocument }> = new Map();
	private toastQueue: string[] = [];
	private toastTimer = 0;
	private achvPage = 0;

	// Environment
	private decorations: { mesh: Mesh; rotSpeed: number; bobSpeed: number; bobAmt: number; baseY: number }[] = [];
	private ambientParticles: { mesh: Mesh; vx: number; vy: number; baseOpacity: number; phase: number }[] = [];

	// Career stats
	private career = {
		hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0,
		biggestWin: 0, doublesWon: 0, splitsWon: 0, surrenders: 0,
		totalEarnings: 0, bestStreak: 0, level: 1, xp: 0,
		dailyDone: 0, lastDaily: '',
		modesPlayed: [] as string[],
		speedHands: 0, countingHands: 0, highstakesWins: 0,
		practiceHands: 0, survivalBest: 0,
		bustCount: 0, insuranceWins: 0,
		cameBackFromLow: false, playedVR: false,
		noBustStreak: 0, bestNoBust: 0,
		themesUsed: [0] as number[],
		skinsSelected: [0] as number[],
		allInCount: 0, minBetWins: 0,
		splitAcesCount: 0, maxSplitHands: 0,
	};
	private leaderboard: LeaderboardEntry[] = [];
	private achievementsUnlocked: Set<string> = new Set();
	private skinsUnlocked: Set<number> = new Set([0]);

	// XR stick cooldown
	private xrStickCooldown = 0;

	// Active hand indicator
	private handIndicator!: Mesh;

	// XR mode tracking
	private isInXR = false;

	// Card dealing animation
	private animatingCards: { card: Card; mesh: Group; startPos: Vector3; endPos: Vector3; timer: number; duration: number; onDone: () => void }[] = [];

	get theme() { return THEMES[this.themeIdx]; }
	get activeHand(): Hand | undefined { return this.playerHands[this.activeHandIdx]; }

	init() {
		this.loadAllData();
		this.audio.init();
		this.audio.startDrone();
		this.shoe = new Shoe(this.numDecks);
		this.particles = new ParticlePool(this.world.scene, 100);
		this.createEnvironment();
		this.createTable();
		this.cardGroup = new Group();
		this.world.scene.add(this.cardGroup);
		this.createHandIndicator();
		this.createPanels();
		this.setupInput();
		this.setState('title');
	}

	// ===== DATA PERSISTENCE =====
	private loadAllData() {
		this.career = loadData('career', this.career);
		this.leaderboard = loadData('leaderboard', []);
		this.achievementsUnlocked = new Set(loadData<string[]>('achievements', []));
		this.skinsUnlocked = new Set(loadData<number[]>('skins', [0]));
		this.bank = loadData('bank', 10000);
		this.themeIdx = loadData('theme', 0);
		this.skinIdx = loadData('skin', 0);
		this.numDecks = loadData('decks', 6);
		this.audio.masterVol = loadData('masterVol', 0.7);
		this.audio.sfxVol = loadData('sfxVol', 0.8);
		this.audio.musicVol = loadData('musicVol', 0.3);
	}

	private saveAllData() {
		saveData('career', this.career);
		saveData('leaderboard', this.leaderboard);
		saveData('achievements', [...this.achievementsUnlocked]);
		saveData('skins', [...this.skinsUnlocked]);
		saveData('bank', this.bank);
		saveData('theme', this.themeIdx);
		saveData('skin', this.skinIdx);
		saveData('decks', this.numDecks);
		saveData('masterVol', this.audio.masterVol);
		saveData('sfxVol', this.audio.sfxVol);
		saveData('musicVol', this.audio.musicVol);
	}

	// ===== ENVIRONMENT =====
	private createEnvironment() {
		const scene = this.world.scene;
		scene.fog = new FogExp2(this.theme.fog, 0.15);
		scene.background = new Color(this.theme.bg);

		// Ambient light
		scene.add(new AmbientLight(0x222244, 0.4));

		// Key light
		const keyLight = new PointLight(this.theme.accent, 1.5, 10);
		keyLight.position.set(0, 3, -1);
		scene.add(keyLight);

		// Accent lights
		const positions = [[-2, 2, -2], [2, 2, -2], [0, 2.5, 1]];
		for (const [x, y, z] of positions) {
			const pl = new PointLight(this.theme.accent, 0.4, 8);
			pl.position.set(x, y, z);
			scene.add(pl);
		}

		// Floor
		const floorGeo = new PlaneGeometry(20, 20);
		const floorMat = new MeshStandardMaterial({ color: this.theme.bg, roughness: 0.9 });
		const floor = new Mesh(floorGeo, floorMat);
		floor.rotation.x = -Math.PI / 2;
		floor.position.y = 0;
		scene.add(floor);

		// Walls
		const wallMat = new MeshStandardMaterial({ color: this.theme.wall, roughness: 0.8 });
		for (const [x, z, ry] of [[-4, 0, Math.PI / 2], [4, 0, -Math.PI / 2], [0, -4, 0]] as [number, number, number][]) {
			const wall = new Mesh(new PlaneGeometry(8, 4), wallMat);
			wall.position.set(x, 2, z);
			wall.rotation.y = ry;
			scene.add(wall);
		}

		// Grid lines on floor
		const gridVerts: number[] = [];
		for (let i = -10; i <= 10; i += 1) {
			gridVerts.push(i, 0.005, -10, i, 0.005, 10);
			gridVerts.push(-10, 0.005, i, 10, 0.005, i);
		}
		const gridGeo = new BufferGeometry();
		gridGeo.setAttribute('position', new Float32BufferAttribute(gridVerts, 3));
		const grid = new LineSegments(gridGeo, new LineBasicMaterial({ color: this.theme.accent, transparent: true, opacity: 0.06 }));
		scene.add(grid);

		// Floating decorations
		const decoGeo = new TorusGeometry(0.15, 0.02, 8, 16);
		for (let i = 0; i < 8; i++) {
			const mat = new MeshStandardMaterial({ color: this.theme.accent, emissive: this.theme.accent, emissiveIntensity: 0.4, transparent: true, opacity: 0.5 });
			const m = new Mesh(decoGeo, mat);
			const angle = (i / 8) * Math.PI * 2;
			const r = 2.5 + Math.random();
			m.position.set(Math.cos(angle) * r, 1.5 + Math.random() * 1.5, Math.sin(angle) * r - 1);
			m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
			scene.add(m);
			this.decorations.push({ mesh: m, rotSpeed: 0.2 + Math.random() * 0.3, bobSpeed: 0.3 + Math.random() * 0.3, bobAmt: 0.08 + Math.random() * 0.05, baseY: m.position.y });
		}

		// Ambient floating particles
		const pGeo = new SphereGeometry(0.008, 4, 4);
		for (let i = 0; i < 40; i++) {
			const mat = new MeshBasicMaterial({ color: this.theme.accent, transparent: true, opacity: 0.2, blending: AdditiveBlending });
			const m = new Mesh(pGeo, mat);
			m.position.set((Math.random() - 0.5) * 6, Math.random() * 3 + 0.5, (Math.random() - 0.5) * 6 - 1);
			scene.add(m);
			this.ambientParticles.push({ mesh: m, vx: (Math.random() - 0.5) * 0.1, vy: 0.02 + Math.random() * 0.03, baseOpacity: 0.1 + Math.random() * 0.15, phase: Math.random() * Math.PI * 2 });
		}
	}

	private createTable() {
		this.tableGroup = new Group();

		// Table top (oval felt)
		const feltGeo = new CylinderGeometry(0.7, 0.7, 0.03, 32);
		feltGeo.scale(1.4, 1, 1);
		const feltMat = new MeshStandardMaterial({ color: this.theme.felt, roughness: 0.7 });
		const felt = new Mesh(feltGeo, feltMat);
		felt.position.set(0, TABLE_Y, TABLE_Z);
		this.tableGroup.add(felt);

		// Table edge
		const edgeGeo = new TorusGeometry(0.7, 0.025, 8, 32);
		edgeGeo.scale(1.4, 1, 1);
		const edgeMat = new MeshStandardMaterial({ color: this.theme.accent, emissive: this.theme.accent, emissiveIntensity: 0.3 });
		const edge = new Mesh(edgeGeo, edgeMat);
		edge.rotation.x = Math.PI / 2;
		edge.position.set(0, TABLE_Y, TABLE_Z);
		this.tableGroup.add(edge);

		// Table legs
		const legGeo = new CylinderGeometry(0.03, 0.04, TABLE_Y, 8);
		const legMat = new MeshStandardMaterial({ color: 0x222222 });
		for (const [x, z] of [[-0.5, -0.3], [0.5, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
			const leg = new Mesh(legGeo, legMat);
			leg.position.set(x, TABLE_Y / 2, TABLE_Z + z);
			this.tableGroup.add(leg);
		}

		// Dealer marker
		const markerGeo = new RingGeometry(0.04, 0.05, 16);
		const markerMat = new MeshBasicMaterial({ color: this.theme.accent, side: DoubleSide, transparent: true, opacity: 0.5 });
		const marker = new Mesh(markerGeo, markerMat);
		marker.rotation.x = -Math.PI / 2;
		marker.position.set(0, TABLE_Y + 0.02, DEALER_Z);
		this.tableGroup.add(marker);

		this.world.scene.add(this.tableGroup);
	}

	// ===== HAND INDICATOR =====
	private createHandIndicator() {
		const geo = new RingGeometry(0.06, 0.075, 24);
		const mat = new MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6, side: DoubleSide });
		this.handIndicator = new Mesh(geo, mat);
		this.handIndicator.rotation.x = -Math.PI / 2;
		this.handIndicator.visible = false;
		this.world.scene.add(this.handIndicator);
	}

	private updateHandIndicator() {
		if (this.state !== 'playerTurn' || this.playerHands.length <= 1) {
			this.handIndicator.visible = false;
			return;
		}
		this.handIndicator.visible = true;
		const xOffset = this.activeHandIdx * 0.4 - (this.playerHands.length - 1) * 0.2;
		this.handIndicator.position.set(xOffset, PLAYER_Y + 0.005, PLAYER_Z + 0.12);
		// Pulse
		const pulse = 0.4 + 0.3 * Math.sin(performance.now() / 300);
		(this.handIndicator.material as MeshBasicMaterial).opacity = pulse;
	}

	// ===== XR CONTROLLER INPUT =====
	private handleXRInput() {
		const input = this.world.input;
		if (!input) return;

		const rightGP = input.gamepads.right;
		const leftGP = input.gamepads.left;
		if (!rightGP && !leftGP) return;

		// Read buttons from right controller
		const rightTrigger = rightGP?.getButtonValue(InputComponent.Trigger) ?? 0;
		const leftTrigger = leftGP?.getButtonValue(InputComponent.Trigger) ?? 0;
		const aButton = rightGP?.getButtonValue(InputComponent.A_Button) ?? 0;
		const bButton = rightGP?.getButtonValue(InputComponent.B_Button) ?? 0;
		const rightStick = rightGP?.getAxesValues(InputComponent.Thumbstick);

		if (this.xrStickCooldown > 0) return;

		// Track VR session
		if (!this.career.playedVR) {
			this.career.playedVR = true;
			this.isInXR = true;
			this.saveAllData();
		}

		if (this.state === 'playerTurn') {
			if (rightTrigger > 0.5) {
				this.playerHit();
				this.xrStickCooldown = 0.3;
			} else if (leftTrigger > 0.5) {
				this.playerStand();
				this.xrStickCooldown = 0.3;
			} else if (aButton > 0.5) {
				this.playerDouble();
				this.xrStickCooldown = 0.3;
			} else if (bButton > 0.5) {
				this.playerSplit();
				this.xrStickCooldown = 0.3;
			}
		} else if (this.state === 'betting') {
			// Thumbstick up/down to adjust bet
			if (rightStick && rightStick.y > 0.5) {
				this.addBet(100);
				this.xrStickCooldown = 0.2;
			} else if (rightStick && rightStick.y < -0.5) {
				this.currentBet = Math.max(0, this.currentBet - 100);
				this.refreshBetting();
				this.xrStickCooldown = 0.2;
			}
			// Right trigger to deal
			if (rightTrigger > 0.5) {
				this.dealHand();
				this.xrStickCooldown = 0.5;
			}
		} else if (this.state === 'gameover') {
			if (rightTrigger > 0.5 || aButton > 0.5) {
				this.rebet();
				this.xrStickCooldown = 0.5;
			} else if (bButton > 0.5) {
				this.clearCards();
				this.setState('title');
				this.xrStickCooldown = 0.5;
			}
		} else if (this.state === 'paused') {
			if (aButton > 0.5) {
				this.setState(this.prevState);
				this.xrStickCooldown = 0.3;
			} else if (bButton > 0.5) {
				this.clearCards();
				this.setState('title');
				this.xrStickCooldown = 0.3;
			}
		}
	}

	// ===== CARD VISUALS =====
	private createCardMesh(card: Card, faceUp: boolean): Group {
		const group = new Group();

		// Card body
		const bodyGeo = new BoxGeometry(CARD_W, CARD_H, CARD_D);
		const bodyMat = new MeshStandardMaterial({ color: 0x111122, roughness: 0.3, metalness: 0.1 });
		const body = new Mesh(bodyGeo, bodyMat);
		group.add(body);

		if (faceUp) {
			// Face side - white base
			const faceGeo = new PlaneGeometry(CARD_W - 0.008, CARD_H - 0.008);
			const faceMat = new MeshBasicMaterial({ color: 0x0a0a1a, side: DoubleSide });
			const face = new Mesh(faceGeo, faceMat);
			face.position.z = CARD_D / 2 + 0.001;
			group.add(face);

			// Suit color indicator strip at top
			const stripGeo = new PlaneGeometry(CARD_W - 0.01, 0.015);
			const stripMat = new MeshBasicMaterial({ color: SUIT_COLORS[card.suit], side: DoubleSide });
			const strip = new Mesh(stripGeo, stripMat);
			strip.position.set(0, CARD_H / 2 - 0.02, CARD_D / 2 + 0.002);
			group.add(strip);

			// Rank + suit text as colored geometry
			const rankLabel = this.createTextMesh(card.rank, SUIT_COLORS[card.suit], 0.03);
			rankLabel.position.set(-CARD_W / 2 + 0.02, CARD_H / 2 - 0.04, CARD_D / 2 + 0.002);
			group.add(rankLabel);

			const suitLabel = this.createTextMesh(SUIT_SYMBOLS[card.suit], SUIT_COLORS[card.suit], 0.02);
			suitLabel.position.set(-CARD_W / 2 + 0.022, CARD_H / 2 - 0.065, CARD_D / 2 + 0.002);
			group.add(suitLabel);

			// Center pip - large suit symbol
			const centerPip = this.createSuitMesh(card.suit, 0.035);
			centerPip.position.set(0, 0, CARD_D / 2 + 0.002);
			group.add(centerPip);

			// Neon border
			const borderGeo = new PlaneGeometry(CARD_W, CARD_H);
			const borderMat = new MeshBasicMaterial({ color: SUIT_COLORS[card.suit], transparent: true, opacity: 0.15, side: DoubleSide });
			const border = new Mesh(borderGeo, borderMat);
			border.position.z = CARD_D / 2 + 0.0005;
			group.add(border);
		} else {
			// Back side
			const backGeo = new PlaneGeometry(CARD_W - 0.008, CARD_H - 0.008);
			const backColor = SKIN_COLORS[this.skinIdx] || 0x0044aa;
			const backMat = new MeshBasicMaterial({ color: backColor, side: DoubleSide });
			const back = new Mesh(backGeo, backMat);
			back.position.z = CARD_D / 2 + 0.001;
			group.add(back);

			// Diamond pattern on back
			const diaGeo = new PlaneGeometry(0.03, 0.03);
			const diaMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, side: DoubleSide });
			for (let r = -2; r <= 2; r++) {
				for (let c = -1; c <= 1; c++) {
					const dia = new Mesh(diaGeo, diaMat);
					dia.position.set(c * 0.035, r * 0.035, CARD_D / 2 + 0.002);
					dia.rotation.z = Math.PI / 4;
					group.add(dia);
				}
			}
		}

		// Rotate to lay flat on table
		group.rotation.x = -Math.PI / 2;

		card.mesh = group;
		card.faceUp = faceUp;
		this.cardGroup.add(group);
		this.cardMeshes.push(group);
		return group;
	}

	private createTextMesh(text: string, color: number, size: number): Group {
		const group = new Group();
		// Simple block-based text using box geometry
		const charWidth = size * 0.55;
		let offsetX = 0;
		for (let i = 0; i < text.length; i++) {
			const geo = new BoxGeometry(charWidth * 0.8, size, 0.001);
			const mat = new MeshBasicMaterial({ color });
			const m = new Mesh(geo, mat);
			m.position.x = offsetX;
			group.add(m);
			offsetX += charWidth;
		}
		return group;
	}

	private createSuitMesh(suit: Suit, size: number): Mesh {
		const color = SUIT_COLORS[suit];
		let geo;
		if (suit === 'hearts' || suit === 'diamonds') {
			geo = new BoxGeometry(size, size, 0.001);
		} else {
			geo = new SphereGeometry(size / 2, 6, 6);
		}
		return new Mesh(geo, new MeshBasicMaterial({ color, side: DoubleSide }));
	}

	private flipCard(card: Card) {
		if (card.mesh) {
			this.cardGroup.remove(card.mesh);
			card.mesh = undefined;
		}
		card.faceUp = true;
		const mesh = this.createCardMesh(card, true);

		// Position at the dealer's row
		const idx = this.dealerCards.indexOf(card);
		const totalW = (this.dealerCards.length - 1) * CARD_SPACING;
		mesh.position.set(-totalW / 2 + idx * CARD_SPACING, DEALER_Y, DEALER_Z);
	}

	private clearCards() {
		for (const m of this.cardMeshes) {
			this.cardGroup.remove(m);
		}
		this.cardMeshes = [];
		this.animatingCards = [];
	}

	// ===== PANEL SETUP =====
	private createPanels() {
		const configs = [
			'title', 'modeselect', 'betting', 'actions', 'hud', 'gameover',
			'pause', 'leaderboard', 'achievements', 'stats', 'skins', 'settings',
			'help', 'toast', 'counting', 'dealerinfo',
		];

		for (const name of configs) {
			const entity = this.world.createEntity();
			const panelConfig: any = { config: `./ui/${name}.json` };

			entity.addComponent(PanelUI, panelConfig);

			// HUD and toast follow the player
			if (name === 'hud' || name === 'toast') {
				entity.addComponent(Follower);
				const fov = entity.getVectorView(Follower, 'offsetPosition');
				if (name === 'hud') { fov[0] = 0; fov[1] = 0.22; fov[2] = -0.6; }
				else { fov[0] = 0; fov[1] = 0.12; fov[2] = -0.6; }
			}
			// Counting panel follows too
			else if (name === 'counting') {
				entity.addComponent(Follower);
				const fov = entity.getVectorView(Follower, 'offsetPosition');
				fov[0] = 0.35; fov[1] = 0.1; fov[2] = -0.6;
			}
			else {
				entity.addComponent(ScreenSpace);
			}
		}

		// Wire up qualify events
		const queryNames = [
			'titlePanel', 'modePanel', 'bettingPanel', 'actionsPanel', 'hudPanel',
			'gameoverPanel', 'pausePanel', 'lbPanel', 'achvPanel', 'statsPanel',
			'skinsPanel', 'settingsPanel', 'helpPanel', 'toastPanel', 'countingPanel', 'dealerInfoPanel',
		] as const;

		const panelNames = [
			'title', 'modeselect', 'betting', 'actions', 'hud',
			'gameover', 'pause', 'leaderboard', 'achievements', 'stats',
			'skins', 'settings', 'help', 'toast', 'counting', 'dealerinfo',
		];

		for (let i = 0; i < queryNames.length; i++) {
			const qn = queryNames[i];
			const pn = panelNames[i];
			this.queries[qn].subscribe('qualify', (entity: any) => {
				const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
				if (!doc) return;
				this.panelEntities.set(pn, { entity, doc });
				this.wirePanel(pn, doc);
				this.updatePanelVisibility();
			});
		}
	}

	private wirePanel(name: string, doc: UIKitDocument) {
		const btn = (id: string, fn: () => void) => {
			const el = doc.getElementById(id) as UIKit.Text | undefined;
			el?.addEventListener('click', () => { this.audio.playClick(); fn(); });
		};

		switch (name) {
			case 'title':
				btn('btn-play', () => this.setState('modeSelect'));
				btn('btn-scores', () => { this.refreshLeaderboard(); this.setState('leaderboard'); });
				btn('btn-achievements', () => { this.achvPage = 0; this.refreshAchievements(); this.setState('achievements'); });
				btn('btn-stats', () => { this.refreshStats(); this.setState('stats'); });
				btn('btn-skins', () => { this.refreshSkins(); this.setState('skins'); });
				btn('btn-settings', () => { this.refreshSettings(); this.setState('settings'); });
				btn('btn-help', () => this.setState('help'));
				break;

			case 'modeselect':
				btn('btn-classic', () => this.startMode('classic'));
				btn('btn-speed', () => this.startMode('speed'));
				btn('btn-highstakes', () => this.startMode('highstakes'));
				btn('btn-counting', () => this.startMode('counting'));
				btn('btn-daily', () => this.startMode('daily'));
				btn('btn-survival', () => this.startMode('survival'));
				btn('btn-tournament', () => this.startMode('tournament'));
				btn('btn-practice', () => this.startMode('practice'));
				btn('btn-back', () => this.setState('title'));
				break;

			case 'betting':
				btn('btn-10', () => this.addBet(10));
				btn('btn-25', () => this.addBet(25));
				btn('btn-50', () => this.addBet(50));
				btn('btn-100', () => this.addBet(100));
				btn('btn-500', () => this.addBet(500));
				btn('btn-1000', () => this.addBet(1000));
				btn('btn-clear', () => { this.currentBet = 0; this.refreshBetting(); });
				btn('btn-allin', () => { this.currentBet = this.bank; this.refreshBetting(); });
				btn('btn-deal', () => this.dealHand());
				break;

			case 'actions':
				btn('btn-hit', () => this.playerHit());
				btn('btn-stand', () => this.playerStand());
				btn('btn-double', () => this.playerDouble());
				btn('btn-split', () => this.playerSplit());
				btn('btn-insurance', () => this.playerInsurance());
				btn('btn-surrender', () => this.playerSurrender());
				break;

			case 'gameover':
				btn('btn-rebet', () => this.rebet());
				btn('btn-menu', () => { this.clearCards(); this.setState('title'); });
				break;

			case 'pause':
				btn('btn-resume', () => this.setState(this.prevState));
				btn('btn-quit', () => { this.clearCards(); this.setState('title'); });
				break;

			case 'leaderboard':
				btn('btn-lb-back', () => this.setState('title'));
				break;

			case 'achievements':
				btn('btn-achv-prev', () => { this.achvPage = Math.max(0, this.achvPage - 1); this.refreshAchievements(); });
				btn('btn-achv-next', () => { this.achvPage = Math.min(7, this.achvPage + 1); this.refreshAchievements(); });
				btn('btn-achv-back', () => this.setState('title'));
				break;

			case 'stats':
				btn('btn-stats-back', () => this.setState('title'));
				break;

			case 'skins':
				for (let i = 0; i < 8; i++) {
					const idx = i;
					btn(`skin-${i}`, () => this.selectSkin(idx));
				}
				btn('btn-skins-back', () => this.setState('title'));
				break;

			case 'settings':
				btn('btn-master-down', () => this.adjustVol('master', -0.1));
				btn('btn-master-up', () => this.adjustVol('master', 0.1));
				btn('btn-sfx-down', () => this.adjustVol('sfx', -0.1));
				btn('btn-sfx-up', () => this.adjustVol('sfx', 0.1));
				btn('btn-music-down', () => this.adjustVol('music', -0.1));
				btn('btn-music-up', () => this.adjustVol('music', 0.1));
				btn('btn-decks-down', () => this.adjustDecks(-1));
				btn('btn-decks-up', () => this.adjustDecks(1));
				btn('btn-theme-prev', () => this.cycleTheme(-1));
				btn('btn-theme-next', () => this.cycleTheme(1));
				btn('btn-settings-back', () => { this.saveAllData(); this.setState('title'); });
				break;

			case 'help':
				btn('btn-help-back', () => this.setState('title'));
				break;
		}
	}

	private setText(panel: string, id: string, text: string) {
		const p = this.panelEntities.get(panel);
		if (!p) return;
		const el = p.doc.getElementById(id) as UIKit.Text | undefined;
		el?.setProperties({ text });
	}

	private setPanelVisible(name: string, visible: boolean) {
		const p = this.panelEntities.get(name);
		if (!p) return;
		const obj = p.entity.object3D;
		if (obj) obj.visible = visible;
	}

	// ===== STATE MANAGEMENT =====
	private setState(newState: GameState) {
		if (this.state !== 'paused') this.prevState = this.state;
		this.state = newState;
		this.updatePanelVisibility();

		if (newState === 'betting') {
			this.refreshBetting();
		} else if (newState === 'title') {
			this.setText('title', 'level-display', `Lv.${this.career.level} - ${LEVEL_TITLES[Math.min(this.career.level - 1, LEVEL_TITLES.length - 1)]}`);
		}
	}

	private updatePanelVisibility() {
		const allPanels = [
			'title', 'modeselect', 'betting', 'actions', 'hud', 'gameover',
			'pause', 'leaderboard', 'achievements', 'stats', 'skins', 'settings',
			'help', 'toast', 'counting', 'dealerinfo',
		];
		const visible: Record<GameState, string[]> = {
			title: ['title'],
			modeSelect: ['modeselect'],
			betting: ['betting', 'hud'],
			dealing: ['hud', 'dealerinfo'],
			playerTurn: ['actions', 'hud', 'dealerinfo'],
			dealerTurn: ['hud', 'dealerinfo'],
			resolving: ['hud', 'dealerinfo'],
			gameover: ['gameover', 'hud'],
			paused: ['pause'],
			leaderboard: ['leaderboard'],
			achievements: ['achievements'],
			stats: ['stats'],
			skins: ['skins'],
			settings: ['settings'],
			help: ['help'],
		};

		const show = new Set(visible[this.state] || []);
		if (this.mode === 'counting' && ['betting', 'dealing', 'playerTurn', 'dealerTurn', 'resolving', 'gameover'].includes(this.state)) {
			show.add('counting');
		}
		if (this.toastTimer > 0) show.add('toast');

		for (const p of allPanels) {
			this.setPanelVisible(p, show.has(p));
		}
	}

	// ===== INPUT =====
	private setupInput() {
		if (typeof document !== 'undefined') {
			document.addEventListener('keydown', (e: KeyboardEvent) => {
				if (this.state === 'playerTurn') {
					if (e.key === 'h' || e.key === 'H') this.playerHit();
					else if (e.key === 's' || e.key === 'S') this.playerStand();
					else if (e.key === 'd' || e.key === 'D') this.playerDouble();
					else if (e.key === 'p' || e.key === 'P') this.playerSplit();
				}
				if (e.key === 'Escape') {
					if (this.state === 'paused') this.setState(this.prevState);
					else if (['playerTurn', 'betting', 'dealing', 'dealerTurn'].includes(this.state)) this.setState('paused');
				}
			});
		}
	}

	// ===== MAIN UPDATE LOOP =====
	update(delta: number) {
		const dt = Math.min(delta, 0.05);

		this.particles.update(dt);
		this.handleXRInput();
		this.updateHandIndicator();

		const time = performance.now() / 1000;
		for (const d of this.decorations) {
			d.mesh.rotation.y += d.rotSpeed * dt;
			d.mesh.position.y = d.baseY + Math.sin(time * d.bobSpeed) * d.bobAmt;
		}

		for (const ap of this.ambientParticles) {
			ap.mesh.position.x += ap.vx * dt;
			ap.mesh.position.y += ap.vy * dt;
			if (ap.mesh.position.y > 4) {
				ap.mesh.position.y = 0.5;
				ap.mesh.position.x = (Math.random() - 0.5) * 6;
				ap.mesh.position.z = (Math.random() - 0.5) * 6 - 1;
			}
			(ap.mesh.material as MeshBasicMaterial).opacity = ap.baseOpacity * (0.6 + 0.4 * Math.sin(time + ap.phase));
		}

		for (let i = this.animatingCards.length - 1; i >= 0; i--) {
			const anim = this.animatingCards[i];
			anim.timer += dt;
			const t = Math.min(1, anim.timer / anim.duration);
			const ease = 1 - Math.pow(1 - t, 3);
			anim.mesh.position.lerpVectors(anim.startPos, anim.endPos, ease);
			if (t >= 1) {
				anim.mesh.position.copy(anim.endPos);
				anim.onDone();
				this.animatingCards.splice(i, 1);
			}
		}

		if (this.state === 'dealing' && this.dealQueue.length > 0 && this.animatingCards.length === 0) {
			this.dealTimer -= dt;
			if (this.dealTimer <= 0) {
				this.processNextDeal();
			}
		}

		if (this.state === 'playerTurn' && this.mode === 'speed') {
			this.speedTimer -= dt;
			this.setText('actions', 'timer-display', `Time: ${Math.max(0, this.speedTimer).toFixed(1)}s`);
			if (this.speedTimer <= 0) {
				this.playerStand();
			}
		}

		if (this.toastTimer > 0) {
			this.toastTimer -= dt;
			if (this.toastTimer <= 0) {
				this.setPanelVisible('toast', false);
				if (this.toastQueue.length > 0) {
					this.showToast(this.toastQueue.shift()!);
				}
			}
		}

		if (this.state === 'resolving') {
			this.resolveTimer -= dt;
			if (this.resolveTimer <= 0) {
				this.finishResolve();
			}
		}

		if (['betting', 'dealing', 'playerTurn', 'dealerTurn', 'resolving', 'gameover'].includes(this.state)) {
			this.refreshHUD();
		}

		if (this.mode === 'counting' && ['playerTurn', 'dealerTurn', 'dealing'].includes(this.state)) {
			this.refreshCounting();
		}

		if (this.xrStickCooldown > 0) this.xrStickCooldown -= dt;
	}

	// ===== GAME MODES =====
	private startMode(mode: GameMode) {
		this.mode = mode;

		// Track mode played
		if (!this.career.modesPlayed.includes(mode)) {
			this.career.modesPlayed.push(mode);
			this.saveAllData();
		}

		if (mode === 'highstakes') {
			this.currentBet = 500;
			this.lastBet = 500;
		} else if (mode === 'survival') {
			this.survivalLives = 3;
			this.bank = 5000;
		} else if (mode === 'tournament') {
			this.tournamentRound = 0;
			this.tournamentMaxRounds = 10;
			this.tournamentScore = 0;
			this.bank = 10000;
		} else if (mode === 'practice') {
			this.bank = 999999;
		} else if (mode === 'daily') {
			const seed = getDailySeed();
			if (this.career.lastDaily === String(seed)) {
				this.showToast('Daily already played today!');
				return;
			}
			this.bank = 10000;
		}

		this.shoe = new Shoe(this.numDecks);
		this.winStreak = 0;
		this.handsPlayed = 0;
		this.setState('betting');
	}

	// ===== BETTING =====
	private addBet(amount: number) {
		if (this.currentBet + amount <= this.bank) {
			this.currentBet += amount;
			this.audio.playChip();
		}
		this.refreshBetting();
	}

	private refreshBetting() {
		this.setText('betting', 'bank-display', `Bank: ${this.bank.toLocaleString()}`);
		this.setText('betting', 'bet-display', `Bet: ${this.currentBet.toLocaleString()}`);
	}

	// ===== DEALING =====
	private dealHand() {
		if (this.currentBet <= 0 || this.currentBet > this.bank) {
			this.showToast('Invalid bet!');
			return;
		}

		this.bank -= this.currentBet;
		this.lastBet = this.currentBet;
		this.clearCards();
		this.playerHands = [{ cards: [], bet: this.currentBet, doubled: false, surrendered: false, stood: false, busted: false, blackjack: false, splitAces: false }];
		this.activeHandIdx = 0;
		this.dealerCards = [];
		this.insuranceBet = 0;

		this.dealQueue = [
			{ target: 'player', handIdx: 0, faceUp: true },
			{ target: 'dealer', handIdx: 0, faceUp: true },
			{ target: 'player', handIdx: 0, faceUp: true },
			{ target: 'dealer', handIdx: 0, faceUp: false },
		];
		this.dealTimer = 0.1;
		this.setState('dealing');
		this.audio.playDeal();
	}

	private processNextDeal() {
		if (this.dealQueue.length === 0) {
			this.onDealComplete();
			return;
		}

		const next = this.dealQueue.shift()!;
		const card = this.shoe.deal();
		card.faceUp = next.faceUp;

		if (next.target === 'player') {
			this.playerHands[next.handIdx].cards.push(card);
		} else {
			this.dealerCards.push(card);
		}

		const mesh = this.createCardMesh(card, card.faceUp);
		const startPos = new Vector3(1.5, TABLE_Y + 0.5, TABLE_Z - 0.8);

		let endPos: Vector3;
		if (next.target === 'player') {
			const hand = this.playerHands[next.handIdx];
			const idx = hand.cards.length - 1;
			const totalW = Math.max(0, (hand.cards.length - 1)) * CARD_SPACING;
			const xOffset = next.handIdx * 0.4 - (this.playerHands.length - 1) * 0.2;
			endPos = new Vector3(-totalW / 2 + idx * CARD_SPACING + xOffset, PLAYER_Y + idx * 0.002, PLAYER_Z);
		} else {
			const idx = this.dealerCards.length - 1;
			const totalW = Math.max(0, (this.dealerCards.length - 1)) * CARD_SPACING;
			endPos = new Vector3(-totalW / 2 + idx * CARD_SPACING, DEALER_Y + idx * 0.002, DEALER_Z);
		}

		mesh.position.copy(startPos);
		this.animatingCards.push({
			card, mesh, startPos, endPos, timer: 0, duration: 0.3,
			onDone: () => {
				this.audio.playDeal();
				this.particles.burst(endPos.x, endPos.y + 0.05, endPos.z, this.theme.accent, 5);
			},
		});
		this.dealTimer = 0.4;
	}

	private onDealComplete() {
		const dealerUpCard = this.dealerCards[0];

		this.setText('dealerinfo', 'dealer-value', `${RANK_VALUES[dealerUpCard.rank]}`);
		this.setText('dealerinfo', 'dealer-status', 'Showing');

		if (isBlackjack(this.playerHands[0].cards)) {
			this.playerHands[0].blackjack = true;
			if (isBlackjack(this.dealerCards)) {
				this.flipCard(this.dealerCards[1]);
				this.resolveHand('push', 0);
			} else {
				this.audio.playBlackjack();
				this.particles.burst(0, PLAYER_Y + 0.1, PLAYER_Z, 0xffaa00, 20);
				this.resolveHand('blackjack', 0);
			}
			return;
		}

		this.speedTimer = this.speedTimeLimit;
		this.setState('playerTurn');
		this.refreshActions();
	}

	// ===== PLAYER ACTIONS =====
	private playerHit() {
		if (this.state !== 'playerTurn') return;
		const hand = this.activeHand;
		if (!hand || hand.stood || hand.busted) return;

		const card = this.shoe.deal();
		card.faceUp = true;
		hand.cards.push(card);

		const mesh = this.createCardMesh(card, true);
		const idx = hand.cards.length - 1;
		const totalW = Math.max(0, idx) * CARD_SPACING;
		const xOffset = this.activeHandIdx * 0.4 - (this.playerHands.length - 1) * 0.2;
		const endPos = new Vector3(-totalW / 2 + idx * CARD_SPACING + xOffset, PLAYER_Y + idx * 0.002, PLAYER_Z);
		const startPos = new Vector3(1.5, TABLE_Y + 0.5, TABLE_Z - 0.8);
		mesh.position.copy(startPos);
		this.animatingCards.push({ card, mesh, startPos, endPos, timer: 0, duration: 0.25, onDone: () => {} });

		this.audio.playHit();

		const val = handValue(hand.cards);
		if (val > 21) {
			hand.busted = true;
			this.audio.playBust();
			this.particles.burst(0, PLAYER_Y + 0.1, PLAYER_Z, 0xff3344, 15);
			this.advanceHand();
		} else if (val === 21) {
			hand.stood = true;
			this.advanceHand();
		} else if (hand.splitAces) {
			hand.stood = true;
			this.advanceHand();
		}

		this.refreshActions();
		this.speedTimer = this.speedTimeLimit;
	}

	private playerStand() {
		if (this.state !== 'playerTurn') return;
		const hand = this.activeHand;
		if (!hand) return;
		hand.stood = true;
		this.advanceHand();
	}

	private playerDouble() {
		if (this.state !== 'playerTurn') return;
		const hand = this.activeHand;
		if (!hand || hand.cards.length !== 2 || hand.bet > this.bank) return;

		this.bank -= hand.bet;
		hand.bet *= 2;
		hand.doubled = true;
		this.audio.playDouble();

		const card = this.shoe.deal();
		card.faceUp = true;
		hand.cards.push(card);

		const mesh = this.createCardMesh(card, true);
		const idx = hand.cards.length - 1;
		const totalW = Math.max(0, idx) * CARD_SPACING;
		const xOffset = this.activeHandIdx * 0.4 - (this.playerHands.length - 1) * 0.2;
		const endPos = new Vector3(-totalW / 2 + idx * CARD_SPACING + xOffset, PLAYER_Y + idx * 0.002, PLAYER_Z);
		mesh.position.set(1.5, TABLE_Y + 0.5, TABLE_Z - 0.8);
		this.animatingCards.push({ card, mesh, startPos: new Vector3(1.5, TABLE_Y + 0.5, TABLE_Z - 0.8), endPos, timer: 0, duration: 0.25, onDone: () => {} });

		const val = handValue(hand.cards);
		if (val > 21) {
			hand.busted = true;
			this.audio.playBust();
		}
		hand.stood = true;
		this.advanceHand();
	}

	private playerSplit() {
		if (this.state !== 'playerTurn') return;
		const hand = this.activeHand;
		if (!hand || !canSplit(hand) || hand.bet > this.bank) return;
		if (this.playerHands.length >= 4) return;

		this.bank -= hand.bet;
		this.audio.playSplit();

		const splitCard = hand.cards.pop()!;
		const splitAces = hand.cards[0].rank === 'A';
		hand.splitAces = splitAces;
		if (splitAces) this.career.splitAcesCount++;

		const newHand: Hand = {
			cards: [splitCard],
			bet: hand.bet,
			doubled: false, surrendered: false, stood: false, busted: false, blackjack: false,
			splitAces,
		};
		this.playerHands.splice(this.activeHandIdx + 1, 0, newHand);

		for (let i = 0; i < 2; i++) {
			const targetIdx = this.activeHandIdx + i;
			const card = this.shoe.deal();
			card.faceUp = true;
			this.playerHands[targetIdx].cards.push(card);
			const mesh = this.createCardMesh(card, true);
			mesh.position.set(1.5, TABLE_Y + 0.5, TABLE_Z - 0.8);
		}

		this.repositionAllCards();
		this.refreshActions();

		if (splitAces) {
			for (let i = 0; i < 2; i++) {
				this.playerHands[this.activeHandIdx + i].stood = true;
			}
			this.advanceHand();
		}
	}

	private playerInsurance() {
		if (this.state !== 'playerTurn') return;
		if (this.dealerCards[0]?.rank !== 'A') return;
		if (this.insuranceBet > 0) return;

		const insAmount = Math.floor(this.activeHand!.bet / 2);
		if (insAmount > this.bank) return;

		this.bank -= insAmount;
		this.insuranceBet = insAmount;
		this.audio.playChip();
		this.showToast(`Insurance: ${insAmount}`);
	}

	private playerSurrender() {
		if (this.state !== 'playerTurn') return;
		const hand = this.activeHand;
		if (!hand || hand.cards.length !== 2) return;
		if (this.playerHands.length > 1) return; // Can't surrender split hands

		hand.surrendered = true;
		hand.stood = true;
		const refund = Math.floor(hand.bet / 2);
		this.bank += refund;
		this.career.surrenders++;
		this.career.hands++;
		this.handsPlayed++;
		this.winStreak = 0;
		this.career.xp += 5;
		this.checkAchievements();
		this.saveAllData();

		this.audio.playLose();
		this.setText('gameover', 'result-title', 'SURRENDERED');
		this.setText('gameover', 'result-payout', `-${hand.bet - refund}`);
		this.setText('gameover', 'result-player', `Your Hand: ${handValue(hand.cards)}`);
		this.setText('gameover', 'result-dealer', `Dealer: ?`);
		this.setText('gameover', 'result-bank', `Bank: ${this.bank.toLocaleString()}`);
		this.setText('gameover', 'result-streak', `Win Streak: 0`);
		this.setText('gameover', 'result-hands', `Hands Played: ${this.handsPlayed}`);
		this.setState('gameover');
	}

	private advanceHand() {
		for (let i = this.activeHandIdx + 1; i < this.playerHands.length; i++) {
			if (!this.playerHands[i].stood && !this.playerHands[i].busted) {
				this.activeHandIdx = i;
				this.speedTimer = this.speedTimeLimit;
				this.refreshActions();
				return;
			}
		}
		this.startDealerTurn();
	}

	// ===== DEALER TURN =====
	private startDealerTurn() {
		this.setState('dealerTurn');

		if (this.dealerCards.length > 1 && !this.dealerCards[1].faceUp) {
			this.flipCard(this.dealerCards[1]);
		}

		if (this.insuranceBet > 0) {
			if (isBlackjack(this.dealerCards)) {
				const payout = this.insuranceBet * 3;
				this.bank += payout;
				this.career.insuranceWins++;
				this.showToast(`Insurance pays ${payout}!`);
			} else {
				this.showToast('Insurance lost');
			}
		}

		const allBusted = this.playerHands.every(h => h.busted);
		if (allBusted) {
			this.resolveAllHands();
			return;
		}

		this.dealerDraw();
	}

	private dealerDraw() {
		const val = handValue(this.dealerCards);
		if (val >= 17) {
			this.resolveAllHands();
			return;
		}

		const card = this.shoe.deal();
		card.faceUp = true;
		this.dealerCards.push(card);

		const mesh = this.createCardMesh(card, true);
		const idx = this.dealerCards.length - 1;
		const totalW = Math.max(0, idx) * CARD_SPACING;
		const endPos = new Vector3(-totalW / 2 + idx * CARD_SPACING, DEALER_Y + idx * 0.002, DEALER_Z);
		mesh.position.set(1.5, TABLE_Y + 0.5, TABLE_Z - 0.8);

		this.animatingCards.push({
			card, mesh,
			startPos: new Vector3(1.5, TABLE_Y + 0.5, TABLE_Z - 0.8),
			endPos, timer: 0, duration: 0.3,
			onDone: () => {
				this.audio.playDeal();
				const newVal = handValue(this.dealerCards);
				this.setText('dealerinfo', 'dealer-value', `${newVal}`);
				if (newVal > 21) {
					this.setText('dealerinfo', 'dealer-status', 'BUST!');
					this.particles.burst(0, DEALER_Y + 0.1, DEALER_Z, 0xff3344, 15);
				}
				setTimeout(() => this.dealerDraw(), 400);
			},
		});
	}

	// ===== RESOLUTION =====
	private resolveAllHands() {
		const dealerVal = handValue(this.dealerCards);
		const dealerBust = dealerVal > 21;

		this.setText('dealerinfo', 'dealer-value', `${dealerVal}`);
		this.setText('dealerinfo', 'dealer-status', dealerBust ? 'BUST!' : '');

		for (let i = 0; i < this.playerHands.length; i++) {
			const hand = this.playerHands[i];
			if (hand.busted) {
				this.resolveHand('lose', i);
			} else if (dealerBust) {
				this.resolveHand('win', i);
			} else {
				const pVal = handValue(hand.cards);
				if (pVal > dealerVal) this.resolveHand('win', i);
				else if (pVal < dealerVal) this.resolveHand('lose', i);
				else this.resolveHand('push', i);
			}
		}
	}

	private resolveHand(result: 'win' | 'lose' | 'push' | 'blackjack', handIdx: number) {
		const hand = this.playerHands[handIdx];
		let payout = 0;

		if (result === 'blackjack') {
			payout = Math.floor(hand.bet * 2.5);
			this.career.blackjacks++;
		} else if (result === 'win') {
			payout = hand.bet * 2;
			if (hand.doubled) this.career.doublesWon++;
		} else if (result === 'push') {
			payout = hand.bet;
		}

		this.bank += payout;

		this.career.hands++;
		this.handsPlayed++;
		if (result === 'win' || result === 'blackjack') {
			this.career.wins++;
			this.winStreak++;
			if (this.winStreak > this.bestStreak) this.bestStreak = this.winStreak;
			if (this.winStreak > this.career.bestStreak) this.career.bestStreak = this.winStreak;
			const earnings = payout - hand.bet;
			this.career.totalEarnings += earnings;
			if (earnings > this.career.biggestWin) this.career.biggestWin = earnings;
		} else if (result === 'lose') {
			this.career.losses++;
			this.winStreak = 0;
		} else {
			this.career.pushes++;
		}

		this.career.xp += result === 'blackjack' ? 50 : result === 'win' ? 25 : result === 'push' ? 10 : 5;
		const newLevel = Math.floor(this.career.xp / XP_PER_LEVEL) + 1;
		if (newLevel > this.career.level) {
			this.career.level = newLevel;
			this.audio.playLevelUp();
			this.showToast(`Level Up! Lv.${newLevel} - ${LEVEL_TITLES[Math.min(newLevel - 1, LEVEL_TITLES.length - 1)]}`);
		}

		// Mode-specific tracking
		if (this.mode === 'speed') this.career.speedHands++;
		if (this.mode === 'counting') this.career.countingHands++;
		if (this.mode === 'practice') this.career.practiceHands++;
		if (this.mode === 'highstakes' && (result === 'win' || result === 'blackjack')) this.career.highstakesWins++;

		// Bust tracking
		if (hand.busted) {
			this.career.bustCount++;
			this.career.noBustStreak = 0;
		} else {
			this.career.noBustStreak++;
			if (this.career.noBustStreak > this.career.bestNoBust) {
				this.career.bestNoBust = this.career.noBustStreak;
			}
		}

		// Comeback tracking
		if (this.bank < 1000 && (result === 'win' || result === 'blackjack') && this.bank + payout >= 1000) {
			this.career.cameBackFromLow = true;
		}

		// All-in tracking
		if (this.currentBet === this.bank + hand.bet) {
			this.career.allInCount++;
		}

		// Min bet win tracking
		if (hand.bet <= 10 && (result === 'win' || result === 'blackjack')) {
			this.career.minBetWins++;
		}

		// Split tracking
		if (this.playerHands.length > 1 && (result === 'win' || result === 'blackjack')) {
			this.career.splitsWon++;
		}
		if (this.playerHands.length > this.career.maxSplitHands) {
			this.career.maxSplitHands = this.playerHands.length;
		}

		for (let s = 0; s < SKIN_UNLOCK_WINS.length; s++) {
			if (this.career.wins >= SKIN_UNLOCK_WINS[s] && !this.skinsUnlocked.has(s)) {
				this.skinsUnlocked.add(s);
				this.showToast(`Skin unlocked: ${SKIN_NAMES[s]}!`);
			}
		}

		if (this.mode === 'survival' && result === 'lose') {
			this.survivalLives--;
			if (this.handsPlayed > this.career.survivalBest) {
				this.career.survivalBest = this.handsPlayed;
			}
		}

		if (this.mode === 'tournament') {
			this.tournamentRound++;
			this.tournamentScore += result === 'blackjack' ? 300 : result === 'win' ? 100 : result === 'push' ? 25 : 0;
		}

		if (this.mode === 'daily') {
			this.career.dailyDone++;
			this.career.lastDaily = String(getDailySeed());
		}

		if (result !== 'lose') {
			this.updateLeaderboard();
		}

		this.checkAchievements();
		this.saveAllData();
		this.showResult(result, handIdx, payout);
	}

	private showResult(result: string, _handIdx: number, payout: number) {
		const playerVal = handValue(this.playerHands[0].cards);
		const dealerVal = handValue(this.dealerCards);

		let title = '';
		if (result === 'blackjack') { title = 'BLACKJACK!'; }
		else if (result === 'win') { title = 'YOU WIN!'; this.audio.playWin(); }
		else if (result === 'push') { title = 'PUSH'; this.audio.playPush(); }
		else { title = 'DEALER WINS'; this.audio.playLose(); }

		this.setText('gameover', 'result-title', title);
		this.setText('gameover', 'result-payout', payout > 0 ? `+${payout.toLocaleString()}` : '0');
		this.setText('gameover', 'result-player', `Your Hand: ${playerVal}`);
		this.setText('gameover', 'result-dealer', `Dealer: ${dealerVal}`);
		this.setText('gameover', 'result-bank', `Bank: ${this.bank.toLocaleString()}`);
		this.setText('gameover', 'result-streak', `Win Streak: ${this.winStreak}`);
		this.setText('gameover', 'result-hands', `Hands Played: ${this.handsPlayed}`);

		if (this.bank <= 0) {
			this.setText('gameover', 'result-title', 'BANKRUPT!');
		}
		if (this.mode === 'survival' && this.survivalLives <= 0) {
			this.setText('gameover', 'result-title', 'SURVIVED: ' + this.handsPlayed + ' HANDS');
		}
		if (this.mode === 'tournament' && this.tournamentRound >= this.tournamentMaxRounds) {
			this.setText('gameover', 'result-title', `TOURNAMENT: ${this.tournamentScore} PTS`);
		}

		this.setState('gameover');

		if (result === 'win' || result === 'blackjack') {
			this.particles.burst(0, PLAYER_Y + 0.15, PLAYER_Z, this.theme.accent, 25);
		}
	}

	private finishResolve() {
		this.setState('gameover');
	}

	private rebet() {
		if (this.bank <= 0) {
			this.bank = 10000;
			this.showToast('Bank reset to 10,000');
		}

		if (this.mode === 'survival' && this.survivalLives <= 0) {
			this.setState('title');
			return;
		}
		if (this.mode === 'tournament' && this.tournamentRound >= this.tournamentMaxRounds) {
			this.setState('title');
			return;
		}

		this.currentBet = Math.min(this.lastBet, this.bank);
		this.clearCards();
		this.setState('betting');
	}

	// ===== CARD REPOSITIONING =====
	private repositionAllCards() {
		for (let h = 0; h < this.playerHands.length; h++) {
			const hand = this.playerHands[h];
			const xOffset = h * 0.4 - (this.playerHands.length - 1) * 0.2;
			for (let c = 0; c < hand.cards.length; c++) {
				const card = hand.cards[c];
				if (card.mesh) {
					const totalW = Math.max(0, (hand.cards.length - 1)) * CARD_SPACING;
					card.mesh.position.set(-totalW / 2 + c * CARD_SPACING + xOffset, PLAYER_Y + c * 0.002, PLAYER_Z);
				}
			}
		}
	}

	// ===== UI REFRESH =====
	private refreshActions() {
		const hand = this.activeHand;
		if (!hand) return;
		this.setText('actions', 'hand-value', `Your Hand: ${handStr(hand.cards)}`);

		if (this.playerHands.length > 1) {
			this.setText('actions', 'hand-value', `Hand ${this.activeHandIdx + 1}/${this.playerHands.length}: ${handStr(hand.cards)}`);
			this.setText('actions', 'hand-indicator', `Playing Hand ${this.activeHandIdx + 1}`);
		} else {
			this.setText('actions', 'hand-indicator', '');
		}
	}

	private refreshHUD() {
		const hand = this.activeHand || this.playerHands[0];
		const playerVal = hand ? handValue(hand.cards) : 0;
		const dealerVal = this.dealerCards.length > 0 ? (this.dealerCards[0].faceUp ? RANK_VALUES[this.dealerCards[0].rank] : 0) : 0;

		this.setText('hud', 'hud-bank', this.bank.toLocaleString());
		this.setText('hud', 'hud-bet', this.currentBet.toLocaleString());
		this.setText('hud', 'hud-player', playerVal > 0 ? `${playerVal}` : '--');
		this.setText('hud', 'hud-dealer', dealerVal > 0 ? `${dealerVal}` : '--');
		this.setText('hud', 'hud-mode', MODE_NAMES[this.mode]);
	}

	private refreshCounting() {
		const rc = this.shoe.getRunningCount();
		const tc = this.shoe.getTrueCount();
		this.setText('counting', 'count-info', `Running Count: ${rc}`);
		this.setText('counting', 'count-true', `True Count: ${tc.toFixed(1)}`);
		this.setText('counting', 'count-decks', `Decks remaining: ${this.shoe.decksRemaining.toFixed(1)}`);

		let advice = 'Bet low';
		if (tc >= 3) advice = 'BET HIGH!';
		else if (tc >= 1) advice = 'Bet moderate';
		else if (tc <= -2) advice = 'Minimum bet';
		this.setText('counting', 'count-advice', advice);
	}

	private refreshLeaderboard() {
		for (let i = 0; i < 10; i++) {
			const entry = this.leaderboard[i];
			const text = entry
				? `${i + 1}. ${entry.score.toLocaleString()} (${entry.mode}, ${entry.hands}h)`
				: `${i + 1}. ---`;
			this.setText('leaderboard', `lb-${i + 1}`, text);
		}
	}

	private refreshAchievements() {
		const achvs = this.getAchievements();
		const page = this.achvPage;
		const start = page * 10;
		const unlocked = this.achievementsUnlocked.size;

		this.setText('achievements', 'achv-progress', `${unlocked} / ${achvs.length} unlocked`);
		this.setText('achievements', 'achv-page', `${page + 1}/${Math.ceil(achvs.length / 10)}`);

		for (let i = 0; i < 10; i++) {
			const idx = start + i;
			const a = achvs[idx];
			if (a) {
				const icon = this.achievementsUnlocked.has(a.id) ? '[X]' : '[ ]';
				this.setText('achievements', `achv-${i + 1}`, `${icon} ${a.name}: ${a.desc}`);
			} else {
				this.setText('achievements', `achv-${i + 1}`, '---');
			}
		}
	}

	private refreshStats() {
		const c = this.career;
		const winRate = c.hands > 0 ? Math.round((c.wins / c.hands) * 100) : 0;
		this.setText('stats', 'stat-hands', `Hands Played: ${c.hands}`);
		this.setText('stats', 'stat-wins', `Wins: ${c.wins}`);
		this.setText('stats', 'stat-losses', `Losses: ${c.losses}`);
		this.setText('stats', 'stat-pushes', `Pushes: ${c.pushes}`);
		this.setText('stats', 'stat-bjs', `Blackjacks: ${c.blackjacks}`);
		this.setText('stats', 'stat-winrate', `Win Rate: ${winRate}%`);
		this.setText('stats', 'stat-biggest', `Biggest Win: ${c.biggestWin.toLocaleString()}`);
		this.setText('stats', 'stat-streak', `Best Streak: ${c.bestStreak}`);
		this.setText('stats', 'stat-earnings', `Total Earnings: ${c.totalEarnings.toLocaleString()}`);
		this.setText('stats', 'stat-doubles', `Doubles Won: ${c.doublesWon}`);
		this.setText('stats', 'stat-splits', `Splits Won: ${c.splitsWon}`);
		this.setText('stats', 'stat-surrenders', `Surrenders: ${c.surrenders}`);
	}

	private refreshSkins() {
		for (let i = 0; i < 8; i++) {
			const unlocked = this.skinsUnlocked.has(i);
			const active = i === this.skinIdx;
			const prefix = active ? '* ' : unlocked ? '' : '[LOCKED] ';
			this.setText('skins', `skin-${i}`, `${prefix}${SKIN_NAMES[i]}`);
		}
	}

	private refreshSettings() {
		this.setText('settings', 'master-val', `${Math.round(this.audio.masterVol * 100)}%`);
		this.setText('settings', 'sfx-val', `${Math.round(this.audio.sfxVol * 100)}%`);
		this.setText('settings', 'music-val', `${Math.round(this.audio.musicVol * 100)}%`);
		this.setText('settings', 'decks-val', `${this.numDecks}`);
		this.setText('settings', 'theme-val', this.theme.name);
	}

	// ===== SETTINGS =====
	private adjustVol(type: 'master' | 'sfx' | 'music', delta: number) {
		if (type === 'master') this.audio.masterVol = Math.max(0, Math.min(1, this.audio.masterVol + delta));
		else if (type === 'sfx') this.audio.sfxVol = Math.max(0, Math.min(1, this.audio.sfxVol + delta));
		else this.audio.musicVol = Math.max(0, Math.min(1, this.audio.musicVol + delta));
		this.audio.updateVolumes();
		this.refreshSettings();
	}

	private adjustDecks(delta: number) {
		this.numDecks = Math.max(1, Math.min(8, this.numDecks + delta));
		this.refreshSettings();
	}

	private cycleTheme(delta: number) {
		this.themeIdx = (this.themeIdx + delta + THEMES.length) % THEMES.length;
		if (!this.career.themesUsed.includes(this.themeIdx)) {
			this.career.themesUsed.push(this.themeIdx);
		}
		this.refreshSettings();
	}

	private selectSkin(idx: number) {
		if (!this.skinsUnlocked.has(idx)) {
			this.showToast(`Win ${SKIN_UNLOCK_WINS[idx]} hands to unlock!`);
			return;
		}
		this.skinIdx = idx;
		if (!this.career.skinsSelected.includes(idx)) {
			this.career.skinsSelected.push(idx);
		}
		this.audio.playClick();
		this.saveAllData();
		this.refreshSkins();
	}

	// ===== TOAST =====
	private showToast(text: string) {
		if (this.toastTimer > 0) {
			this.toastQueue.push(text);
			return;
		}
		this.setText('toast', 'toast-text', text);
		this.setPanelVisible('toast', true);
		this.toastTimer = 2.5;
	}

	// ===== LEADERBOARD =====
	private updateLeaderboard() {
		this.leaderboard.push({
			score: this.bank,
			mode: MODE_NAMES[this.mode],
			date: new Date().toISOString().slice(0, 10),
			hands: this.handsPlayed,
		});
		this.leaderboard.sort((a, b) => b.score - a.score);
		this.leaderboard = this.leaderboard.slice(0, 20);
	}

	// ===== ACHIEVEMENTS =====
	private getAchievements(): Achievement[] {
		const c = this.career;
		return [
			{ id: 'first_hand', name: 'First Hand', desc: 'Play your first hand', check: () => c.hands >= 1 },
			{ id: 'ten_hands', name: 'Getting Started', desc: 'Play 10 hands', check: () => c.hands >= 10 },
			{ id: 'fifty_hands', name: 'Regular', desc: 'Play 50 hands', check: () => c.hands >= 50 },
			{ id: 'hundred_hands', name: 'Veteran', desc: 'Play 100 hands', check: () => c.hands >= 100 },
			{ id: 'five_hundred_hands', name: 'Grinder', desc: 'Play 500 hands', check: () => c.hands >= 500 },
			{ id: 'thousand_hands', name: 'Card Shark', desc: 'Play 1000 hands', check: () => c.hands >= 1000 },
			{ id: 'first_win', name: 'Winner', desc: 'Win a hand', check: () => c.wins >= 1 },
			{ id: 'ten_wins', name: 'On a Roll', desc: 'Win 10 hands', check: () => c.wins >= 10 },
			{ id: 'fifty_wins', name: 'Hot Streak', desc: 'Win 50 hands', check: () => c.wins >= 50 },
			{ id: 'hundred_wins', name: 'High Roller', desc: 'Win 100 hands', check: () => c.wins >= 100 },
			{ id: 'first_bj', name: 'Natural', desc: 'Get your first blackjack', check: () => c.blackjacks >= 1 },
			{ id: 'five_bj', name: 'Lucky Streak', desc: 'Get 5 blackjacks', check: () => c.blackjacks >= 5 },
			{ id: 'twenty_bj', name: 'Born Lucky', desc: 'Get 20 blackjacks', check: () => c.blackjacks >= 20 },
			{ id: 'fifty_bj', name: 'Blackjack Master', desc: 'Get 50 blackjacks', check: () => c.blackjacks >= 50 },
			{ id: 'streak_3', name: 'Hat Trick', desc: 'Win 3 in a row', check: () => c.bestStreak >= 3 },
			{ id: 'streak_5', name: 'On Fire', desc: 'Win 5 in a row', check: () => c.bestStreak >= 5 },
			{ id: 'streak_10', name: 'Unstoppable', desc: 'Win 10 in a row', check: () => c.bestStreak >= 10 },
			{ id: 'streak_15', name: 'Legendary', desc: 'Win 15 in a row', check: () => c.bestStreak >= 15 },
			{ id: 'streak_20', name: 'Godlike', desc: 'Win 20 in a row', check: () => c.bestStreak >= 20 },
			{ id: 'big_win_500', name: 'Jackpot!', desc: 'Win 500+ in a single hand', check: () => c.biggestWin >= 500 },
			{ id: 'big_win_1k', name: 'High Roller', desc: 'Win 1,000+ in a single hand', check: () => c.biggestWin >= 1000 },
			{ id: 'big_win_5k', name: 'Whale', desc: 'Win 5,000+ in a single hand', check: () => c.biggestWin >= 5000 },
			{ id: 'big_win_10k', name: 'Mega Whale', desc: 'Win 10,000+ in a single hand', check: () => c.biggestWin >= 10000 },
			{ id: 'double_win', name: 'Double Down', desc: 'Win a doubled hand', check: () => c.doublesWon >= 1 },
			{ id: 'five_doubles', name: 'Double Agent', desc: 'Win 5 doubled hands', check: () => c.doublesWon >= 5 },
			{ id: 'twenty_doubles', name: 'Double Master', desc: 'Win 20 doubled hands', check: () => c.doublesWon >= 20 },
			{ id: 'split_win', name: 'Splitter', desc: 'Win a split hand', check: () => c.splitsWon >= 1 },
			{ id: 'five_splits', name: 'Split Pro', desc: 'Win 5 split hands', check: () => c.splitsWon >= 5 },
			{ id: 'level_5', name: 'Rising Star', desc: 'Reach Level 5', check: () => c.level >= 5 },
			{ id: 'level_10', name: 'Expert', desc: 'Reach Level 10', check: () => c.level >= 10 },
			{ id: 'level_15', name: 'Master', desc: 'Reach Level 15', check: () => c.level >= 15 },
			{ id: 'earnings_1k', name: 'Thousandaire', desc: 'Earn 1,000 total', check: () => c.totalEarnings >= 1000 },
			{ id: 'earnings_10k', name: 'Ten K Club', desc: 'Earn 10,000 total', check: () => c.totalEarnings >= 10000 },
			{ id: 'earnings_50k', name: 'Fifty K Club', desc: 'Earn 50,000 total', check: () => c.totalEarnings >= 50000 },
			{ id: 'earnings_100k', name: 'Hundred K Club', desc: 'Earn 100,000 total', check: () => c.totalEarnings >= 100000 },
			{ id: 'all_modes', name: 'Jack of All Trades', desc: 'Play all 8 game modes', check: () => c.modesPlayed.length >= 8 },
			{ id: 'skin_3', name: 'Fashionista', desc: 'Unlock 3 card skins', check: () => this.skinsUnlocked.size >= 3 },
			{ id: 'skin_all', name: 'Collector', desc: 'Unlock all card skins', check: () => this.skinsUnlocked.size >= 8 },
			{ id: 'bank_20k', name: 'Money Bags', desc: 'Have 20,000+ in bank', check: () => this.bank >= 20000 },
			{ id: 'bank_50k', name: 'Fat Stacks', desc: 'Have 50,000+ in bank', check: () => this.bank >= 50000 },
			{ id: 'bank_100k', name: 'Casino Mogul', desc: 'Have 100,000+ in bank', check: () => this.bank >= 100000 },
			{ id: 'survival_10', name: 'Survivor', desc: 'Survive 10 hands in Survival', check: () => c.survivalBest >= 10 },
			{ id: 'survival_25', name: 'Endurance', desc: 'Survive 25 hands in Survival', check: () => c.survivalBest >= 25 },
			{ id: 'tournament_win', name: 'Champion', desc: 'Score 500+ in Tournament', check: () => this.tournamentScore >= 500 },
			{ id: 'push_5', name: 'Stalemate', desc: 'Get 5 pushes', check: () => c.pushes >= 5 },
			{ id: 'push_20', name: 'Diplomat', desc: 'Get 20 pushes', check: () => c.pushes >= 20 },
			{ id: 'winrate_60', name: 'Skilled Player', desc: 'Maintain 60%+ win rate (100+ hands)', check: () => c.hands >= 100 && (c.wins / c.hands) >= 0.6 },
			{ id: 'winrate_70', name: 'Card Counter', desc: 'Maintain 70%+ win rate (100+ hands)', check: () => c.hands >= 100 && (c.wins / c.hands) >= 0.7 },
			{ id: 'speed_5', name: 'Speed Demon', desc: 'Play 5 Speed Round hands', check: () => c.speedHands >= 5 },
			{ id: 'speed_20', name: 'Lightning Fast', desc: 'Play 20 Speed Round hands', check: () => c.speedHands >= 20 },
			{ id: 'highstakes_win', name: 'Whale Watcher', desc: 'Win a High Stakes hand', check: () => c.highstakesWins >= 1 },
			{ id: 'counting_10', name: 'Counter', desc: 'Play 10 Counting Trainer hands', check: () => c.countingHands >= 10 },
			{ id: 'daily_3', name: 'Daily Grinder', desc: 'Complete 3 daily challenges', check: () => c.dailyDone >= 3 },
			{ id: 'daily_7', name: 'Weekly Warrior', desc: 'Complete 7 daily challenges', check: () => c.dailyDone >= 7 },
			{ id: 'daily_30', name: 'Monthly Master', desc: 'Complete 30 daily challenges', check: () => c.dailyDone >= 30 },
			{ id: 'no_bust_10', name: 'Careful Player', desc: 'Play 10 hands without busting', check: () => c.bestNoBust >= 10 },
			{ id: 'bust_5', name: 'Risk Taker', desc: 'Bust 5 times', check: () => c.bustCount >= 5 },
			{ id: 'bust_20', name: 'Daredevil', desc: 'Bust 20 times', check: () => c.bustCount >= 20 },
			{ id: 'practice_10', name: 'Student', desc: 'Play 10 Practice hands', check: () => c.practiceHands >= 10 },
			{ id: 'practice_50', name: 'Studious', desc: 'Play 50 Practice hands', check: () => c.practiceHands >= 50 },
			{ id: 'comeback', name: 'Comeback Kid', desc: 'Win after being below 1000', check: () => c.cameBackFromLow },
			{ id: 'perfect_game', name: 'Perfect Game', desc: 'Win 10 hands without losing', check: () => c.bestStreak >= 10 },
			{ id: 'night_owl', name: 'Night Owl', desc: 'Play at midnight', check: () => new Date().getHours() === 0 },
			{ id: 'early_bird', name: 'Early Bird', desc: 'Play at 6 AM', check: () => new Date().getHours() === 6 },
			{ id: 'marathon', name: 'Marathon', desc: 'Play 50 hands in one session', check: () => this.handsPlayed >= 50 },
			{ id: 'sprint', name: 'Sprint', desc: 'Play 20 hands in one session', check: () => this.handsPlayed >= 20 },
			{ id: 'all_skins', name: 'Fashionista Max', desc: 'Select every skin once', check: () => c.skinsSelected.length >= 8 },
			{ id: 'bankrupt', name: 'Rock Bottom', desc: 'Go bankrupt', check: () => this.bank <= 0 },
			{ id: 'thousand_wins', name: 'Legendary Gambler', desc: 'Win 1000 hands', check: () => c.wins >= 1000 },
			{ id: 'five_k_hands', name: 'Dedication', desc: 'Play 5000 hands total', check: () => c.hands >= 5000 },
			{ id: 'theme_all', name: 'Decorator', desc: 'Try all 5 themes', check: () => c.themesUsed.length >= 5 },
			{ id: 'insurance_win', name: 'Insured', desc: 'Win an insurance bet', check: () => c.insuranceWins >= 1 },
			{ id: 'split_aces', name: 'Ace Splitter', desc: 'Split a pair of aces', check: () => c.splitAcesCount >= 1 },
			{ id: 'triple_split', name: 'Triple Threat', desc: 'Have 3 hands via splits', check: () => c.maxSplitHands >= 3 },
			{ id: 'quad_split', name: 'Four of a Kind', desc: 'Have 4 hands via splits', check: () => c.maxSplitHands >= 4 },
			{ id: 'max_bet', name: 'All In', desc: 'Bet your entire bank', check: () => c.allInCount >= 1 },
			{ id: 'min_bet', name: 'Penny Pincher', desc: 'Win with minimum bet', check: () => c.minBetWins >= 1 },
			{ id: 'vr_player', name: 'Virtual Reality', desc: 'Play in VR mode', check: () => c.playedVR },
		];
	}

	private checkAchievements() {
		const achvs = this.getAchievements();
		for (const a of achvs) {
			if (!this.achievementsUnlocked.has(a.id) && a.check()) {
				this.achievementsUnlocked.add(a.id);
				this.audio.playAchievement();
				this.showToast(`ACHIEVEMENT: ${a.name}!`);
			}
		}
	}
}

// ===== MAIN =====
async function main() {
	const container = document.getElementById('app') as HTMLDivElement;
	if (!container) return;

	const world = await World.create(container, {
		xr: { offer: 'once' },
		render: {
			fov: 60,
			near: 0.01,
			far: 200,
		},
		features: {
			grabbing: false,
			locomotion: true,
			physics: false,
			spatialUI: true,
		},
	});

	world.registerSystem(BlackjackGame);
}

main();

