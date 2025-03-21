const board = Array.from({ length: 4 }, () => Array(4).fill(0));
let score = 0;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('newGameButton').addEventListener('click', newGame);
    document.addEventListener('keydown', handleKeyPress);
    newGame();
});

function newGame() {
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            board[i][j] = 0;
        }
    }
    score = 0;
    updateScore();
    generateNewNumber();
    generateNewNumber();
    updateBoard();
    document.getElementById('gameover').style.display = 'none';
}

function generateNewNumber() {
    let emptyCells = [];
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            if (board[i][j] === 0) {
                emptyCells.push({ x: i, y: j });
            }
        }
    }
    if (emptyCells.length === 0) return;
    const { x, y } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    // 生成随机数，根据不同范围生成不同的值
    const randomValue = Math.random();
    if (randomValue < 0.7) {
        board[x][y] = 2;
    } else if (randomValue < 0.9) {
        board[x][y] = 4;
    } else {
        board[x][y] = 8;
    }
}

function updateBoard() {
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const cell = document.getElementById(`grid-cell-${i}-${j}`);
            const targetValue = board[i][j];
            cell.textContent = targetValue === 0 ? '' : targetValue;
            cell.style.backgroundColor = getBackgroundColor(targetValue);
            // 这里可以添加更复杂的动画逻辑，例如根据移动方向设置 transform
            // 目前简单实现，可根据实际需求完善
            cell.style.transform = 'scale(1)';
            if (targetValue > 0) {
                cell.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    cell.style.transform = 'scale(1)';
                }, 100);
            }
        }
    }
}

function getBackgroundColor(value) {
    switch (value) {
        case 2: return '#eee4da';
        case 4: return '#ede0c8';
        case 8: return '#f2b179';
        case 16: return '#f59563';
        case 32: return '#f67c5f';
        case 64: return '#f65e3b';
        case 128: return '#edcf72';
        case 256: return '#edcc61';
        case 512: return '#edc850';
        case 1024: return '#edc53f';
        case 2048: return '#edc22e';
        default: return '#cdc1b4';
    }
}

function handleKeyPress(event) {
    let hasMoved = false;
    switch (event.key) {
        case 'ArrowUp':
            hasMoved = moveUp();
            break;
        case 'ArrowDown':
            hasMoved = moveDown();
            break;
        case 'ArrowLeft':
            hasMoved = moveLeft();
            break;
        case 'ArrowRight':
            hasMoved = moveRight();
            break;
    }
    if (hasMoved) {
        generateNewNumber();
        updateBoard();
        if (isGameOver()) {
            document.getElementById('gameover').style.display = 'block';
        }
    }
}

function moveUp() {
    let hasMoved = false;
    for (let j = 0; j < 4; j++) {
        let originalColumn = board.map(row => row[j]);
        let newColumn = compress(originalColumn);
        if (JSON.stringify(originalColumn) !== JSON.stringify(newColumn)) {
            hasMoved = true;
        }
        for (let i = 0; i < 4; i++) {
            board[i][j] = newColumn[i];
        }
    }
    return hasMoved;
}

function moveDown() {
    let hasMoved = false;
    for (let j = 0; j < 4; j++) {
        let originalColumn = board.map(row => row[j]).reverse();
        let newColumn = compress(originalColumn).reverse();
        if (JSON.stringify(originalColumn) !== JSON.stringify(newColumn)) {
            hasMoved = true;
        }
        for (let i = 0; i < 4; i++) {
            board[i][j] = newColumn[i];
        }
    }
    return hasMoved;
}

function moveLeft() {
    let hasMoved = false;
    for (let i = 0; i < 4; i++) {
        let originalRow = [...board[i]];
        let newRow = compress(originalRow);
        if (JSON.stringify(originalRow) !== JSON.stringify(newRow)) {
            hasMoved = true;
        }
        board[i] = newRow;
    }
    return hasMoved;
}

function moveRight() {
    let hasMoved = false;
    for (let i = 0; i < 4; i++) {
        let originalRow = [...board[i]].reverse();
        let newRow = compress(originalRow).reverse();
        if (JSON.stringify(originalRow) !== JSON.stringify(newRow)) {
            hasMoved = true;
        }
        board[i] = newRow;
    }
    return hasMoved;
}

function compress(row) {
    let newRow = row.filter(val => val !== 0);
    let merged = false;
    for (let i = 0; i < newRow.length - 1; i++) {
        if (newRow[i] === newRow[i + 1] && !merged) {
            newRow[i] *= 2;
            score += newRow[i];
            newRow[i + 1] = 0;
            merged = true;
        } else {
            merged = false;
        }
    }
    newRow = newRow.filter(val => val !== 0);
    while (newRow.length < 4) {
        newRow.push(0);
    }
    updateScore();
    return newRow;
}

function updateScore() {
    document.getElementById('score').textContent = score;
}

function isGameOver() {
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            if (board[i][j] === 0) return false;
            if (i < 3 && board[i][j] === board[i + 1][j]) return false;
            if (j < 3 && board[i][j] === board[i][j + 1]) return false;
        }
    }
    return true;
}