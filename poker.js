// Poker game logic for PeakeCoin Poker
// Requires Hive Keychain for wallet connect and token transfers

let user = {
    address: '',
    balance: 0,
    token: 'PEK', // Use PEK consistently
    loggedIn: false
};

let betAmount = 10;
let gameState = null;

// Card and Poker logic
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function shuffleDeck() {
    let deck = [];
    for (let s of SUITS) for (let r of RANKS) deck.push(r + s);
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function dealHands(deck) {
    return {
        player: [deck.pop(), deck.pop()],
        ai: [deck.pop(), deck.pop()],
        community: [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()]
    };
}

function renderCards(cards) {
    return cards.map(card => `<span class="card">${card}</span>`).join(' ');
}

function updateWalletUI() {
    document.getElementById('wallet-address').textContent = user.address ? `Wallet: ${user.address}` : '';
    document.getElementById('wallet-balance').textContent = user.address ? `Balance: ${user.balance} PEK` : '';
}

function showMessage(msg) {
    document.getElementById('messages').textContent = msg;
}

async function connectWallet() {
    if (!window.hive_keychain) {
        showMessage('Hive Keychain extension is required! Please install it from https://hive-keychain.com and refresh this page.');
        return;
    }
    const username = prompt('Enter your Hive username (the same as in your Hive Keychain extension):');
    if (!username) {
        showMessage('Username is required.');
        return;
    }
    showMessage('Requesting signature from Hive Keychain... Please approve the popup and enter your Hive username if prompted.');
    window.hive_keychain.requestSignBuffer(
        username,
        'Sign in to PeakeCoin Poker',
        'Posting',
        async function(response) {
            if (response.success) {
                user.address = username;
                user.loggedIn = true;
                await fetchBalance();
                updateWalletUI();
                showMessage('Wallet connected!');
                document.getElementById('game-section').style.display = '';
                document.getElementById('start-section').style.display = '';
            } else {
                showMessage('Hive Keychain sign-in failed or was rejected. Please try again.');
            }
        }
    );
}

async function fetchBalance() {
    const url = 'https://api.hive-engine.com/rpc/contracts';
    const symbol = 'PEK';
    const account = user.address ? user.address.toLowerCase() : '';
    const payload = {
        jsonrpc: '2.0',
        method: 'find',
        params: {
            contract: 'tokens',
            table: 'balances',
            query: { account, symbol }
        },
        id: 1
    };
    try {
        const r = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(payload)
            // Do NOT set headers at all!
        });
        const data = await r.json();
        console.log('Hive Engine balance response:', data); // For debugging
        if (data.result && Array.isArray(data.result) && data.result.length > 0 && data.result[0].balance) {
            user.balance = parseFloat(data.result[0].balance);
        } else {
            user.balance = 0;
            showMessage('No PEK balance found for this account.');
        }
        user.token = symbol;
        updateWalletUI();
    } catch (e) {
        user.balance = 0;
        user.token = symbol;
        showMessage('Error fetching PEK balance.');
        updateWalletUI();
    }
}

function startGame() {
    betAmount = parseFloat(document.getElementById('bet-amount').value);
    if (!user.loggedIn) {
        showMessage('Connect your wallet with Hive Keychain first!');
        return;
    }
    if (user.balance < betAmount) {
        showMessage('Insufficient PEK balance!');
        return;
    }
    // Lock bet (simulate by reducing balance)
    user.balance -= betAmount;
    updateWalletUI();
    // Deal cards
    let deck = shuffleDeck();
    let hands = dealHands(deck);
    gameState = {
        ...hands,
        pot: betAmount * 2,
        playerBet: betAmount,
        aiBet: betAmount,
        stage: 0 // 0: pre-flop, 1: flop, 2: turn, 3: river, 4: showdown
    };
    renderTable();
    showMessage('Game started!');
}

function renderTable() {
    let t = document.getElementById('table');
    let pc = renderCards(gameState.player);
    let ac = renderCards(gameState.ai.map(_ => '🂠'));
    let comm = renderCards(gameState.community.slice(0, [0,3,4,5,5][gameState.stage]));
    t.innerHTML = `<div>Your Hand: ${pc}</div><div>AI Hand: ${ac}</div><div>Community: ${comm}</div><div>Pot: ${gameState.pot} PEK</div>`;
    renderControls();
}

function renderControls() {
    let c = document.getElementById('player-controls');
    c.innerHTML = '';
    if (gameState.stage < 4) {
        let btn = document.createElement('button');
        btn.textContent = 'Next';
        btn.onclick = () => {
            gameState.stage++;
            if (gameState.stage === 4) {
                finishGame();
            } else {
                renderTable();
            }
        };
        c.appendChild(btn);
    } else {
        let btn = document.createElement('button');
        btn.textContent = 'Play Again';
        btn.onclick = () => {
            document.getElementById('messages').textContent = '';
            startGame();
        };
        c.appendChild(btn);
    }
}

function handRank(hand, community) {
    // Simple hand evaluator: just count pairs for demo
    let all = hand.concat(community);
    let ranks = all.map(c => c.slice(0, -1));
    let counts = {};
    for (let r of ranks) counts[r] = (counts[r]||0)+1;
    let pairs = Object.values(counts).filter(x=>x===2).length;
    let trips = Object.values(counts).filter(x=>x===3).length;
    let quads = Object.values(counts).filter(x=>x===4).length;
    if (quads) return 7;
    if (trips && pairs) return 6;
    if (trips) return 3;
    if (pairs >= 2) return 2;
    if (pairs === 1) return 1;
    return 0;
}

async function finishGame() {
    let pr = handRank(gameState.player, gameState.community);
    let ar = handRank(gameState.ai, gameState.community);
    let msg;
    if (pr > ar) {
        msg = `You win! +${gameState.pot} PEK`;
        await sendPeakecoin(user.address, gameState.pot);
        await fetchBalance();
        updateWalletUI();
    } else if (ar > pr) {
        msg = 'AI wins! Better luck next time.';
    } else {
        msg = 'It\'s a tie!';
        // Refund bet
        user.balance += betAmount;
        updateWalletUI();
    }
    showMessage(msg);
    renderTable();
}
async function sendPeakecoin(to, amount) {
    if (!window.hive_keychain) {
        alert('Hive Keychain required to send PEK!');
        return;
    }
    return new Promise((resolve, reject) => {
        window.hive_keychain.requestCustomJson(
            user.address,
            'ssc-mainnet-hive',
            'Active',
            JSON.stringify({
                contractName: 'tokens',
                contractAction: 'transfer',
                contractPayload: {
                    symbol: 'PEK', // Use PEK consistently
                    to,
                    quantity: String(amount),
                    memo: 'Poker win!'
                }
            }),
            'Send PEK',
            r => {
                if (r.success) resolve();
                else reject(r.message);
            }
        );
    });
}

document.getElementById('connect-wallet').addEventListener('click', connectWallet);
document.getElementById('start-game').onclick = startGame;
