const board = Array.from({ length: 4 }, () => Array(4).fill(0));
let score = 0;

// 新增：获取当前棋盘上的最大数字
function getMaxNumber() {
    let max = 0;
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            if (board[i][j] > max) {
                max = board[i][j];
            }
        }
    }
    return max;
}

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
    const max = getMaxNumber();
    let possibleNumbers = [2, 4];
    if (max >= 4) possibleNumbers.push(8);
    if (max >= 8) possibleNumbers.push(16);
    if (max >= 16) possibleNumbers.push(32);
    board[x][y] = possibleNumbers[Math.floor(Math.random() * possibleNumbers.length)];
}

function updateBoard() {
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const cell = document.getElementById(`grid-cell-${i}-${j}`);
            const targetValue = board[i][j];
            cell.textContent = targetValue === 0 ? '' : targetValue;
            cell.style.backgroundColor = getBackgroundColor(targetValue);
            cell.setAttribute('data-value', targetValue); // 添加 data-value 属性
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
    switch (event.key) {
        case 'ArrowUp':
            moveUp();
            break;
        case 'ArrowDown':
            moveDown();
            break;
        case 'ArrowLeft':
            moveLeft();
            break;
        case 'ArrowRight':
            moveRight();
            break;
    }
    generateNewNumber();
    updateBoard();
    if (isGameOver()) {
        document.getElementById('gameover').style.display = 'block';
    }
}

function moveUp() {
    for (let j = 0; j < 4; j++) {
        let compressed = compress(board.map(row => row[j]));
        for (let i = 0; i < 4; i++) {
            board[i][j] = compressed[i];
        }
    }
}

function moveDown() {
    for (let j = 0; j < 4; j++) {
        let compressed = compress(board.map(row => row[j]).reverse()).reverse();
        for (let i = 0; i < 4; i++) {
            board[i][j] = compressed[i];
        }
    }
}

function moveLeft() {
    for (let i = 0; i < 4; i++) {
        board[i] = compress(board[i]);
    }
}

function moveRight() {
    for (let i = 0; i < 4; i++) {
        board[i] = compress(board[i].reverse()).reverse();
    }
}

function compress(row) {
    let newRow = row.filter(val => val !== 0);
    for (let i = 0; i < newRow.length - 1; i++) {
        if (newRow[i] === newRow[i + 1]) {
            newRow[i] *= 2;
            score += newRow[i];
            newRow[i + 1] = 0;
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