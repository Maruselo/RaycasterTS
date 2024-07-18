"use strict";
const FPS = 60;
const frameDuration = 1000 / FPS;
let isRunning = true;
let keysPressed = {};
const MOV_SPEED = 1.2;
const ROT_SPEED = 2;
const MAP_ROWS = 7;
const MAP_COLS = 10;
const SCENE = [
    [1, 1, 1, 1, 1, 4, 4, 4, 4, 4],
    [1, 0, 0, 0, 2, 0, 0, 0, 0, 4],
    [1, 0, 0, 0, 2, 0, 0, 0, 0, 4],
    [1, 0, 3, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 3, 3, 3, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 0, 0, 1, 1],
];
class Vector2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    static zero() {
        return new Vector2(0, 0);
    }
    static fromAngle(angle) {
        return new Vector2(Math.cos(angle), Math.sin(angle));
    }
    toArray() {
        return [this.x, this.y];
    }
    add(vector) {
        return new Vector2(this.x + vector.x, this.y + vector.y);
    }
    sub(vector) {
        return new Vector2(this.x - vector.x, this.y - vector.y);
    }
    div(vector) {
        return new Vector2(this.x / vector.x, this.y / vector.y);
    }
    mult(vector) {
        return new Vector2(this.x * vector.x, this.y * vector.y);
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    norm() {
        const l = this.length();
        if (l === 0)
            return new Vector2(0, 0);
        return new Vector2(this.x / l, this.y / l);
    }
    scale(k) {
        return new Vector2(this.x * k, this.y * k);
    }
    rotate(angle) {
        return new Vector2(this.x * Math.cos(angle) - this.y * Math.sin(angle), this.x * Math.sin(angle) + this.y * Math.cos(angle));
    }
}
class Vector3 {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    toArray() {
        return [this.x, this.y, this.z];
    }
    scale(k) {
        return new Vector3(this.x * k, this.y * k, this.z * k);
    }
}
class Color {
    constructor(r, g, b, a = 1) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
    setBrightness(factor) {
        const newColor = new Color(0, 0, 0);
        if (factor > 1)
            factor = 1;
        else if (factor < -1)
            factor = -1;
        if (factor < 0) {
            factor += 1;
            newColor.r = this.r * factor;
            newColor.g = this.g * factor;
            newColor.b = this.b * factor;
        }
        else {
            newColor.r = (255 - this.r) * factor + this.r;
            newColor.g = (255 - this.g) * factor + this.g;
            newColor.b = (255 - this.b) * factor + this.b;
        }
        return newColor;
    }
    toString() {
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
    }
}
class Player {
    constructor(position, direction) {
        this.position = position;
        this.direction = direction;
    }
    rotate(value) {
        this.direction = this.direction.rotate(value);
    }
    move(value) {
        const newMapLoc = new Vector2(Math.trunc(this.position.x + this.direction.x * value), Math.trunc(this.position.y + this.direction.y * value));
        if (newMapLoc.x < 0 || newMapLoc.x >= MAP_COLS ||
            newMapLoc.y < 0 || newMapLoc.y >= MAP_ROWS)
            return;
        if (!SCENE[Math.trunc(this.position.y)][newMapLoc.x])
            this.position.x += this.direction.x * value;
        if (!SCENE[newMapLoc.y][Math.trunc(this.position.x)])
            this.position.y += this.direction.y * value;
    }
}
class Camera {
    constructor(plane, x = 0) {
        this.plane = plane;
        this.x = x;
    }
    rotate(value) {
        this.plane = this.plane.rotate(value);
    }
}
const SCENE_COLORS = {
    1: [255, 0, 0],
    2: [0, 255, 0],
    3: [0, 0, 255],
    4: [255, 255, 255],
};
function fillCircle(ctx, center, radius) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
    ctx.fill();
}
function strokeLine(ctx, start, end) {
    ctx.beginPath();
    ctx.moveTo(...start.toArray());
    ctx.lineTo(...end.toArray());
    ctx.stroke();
}
function getCanvasSize(ctx) {
    return new Vector2(ctx.canvas.width, ctx.canvas.height);
}
function snapToGrid(ray, point, origin, axis) {
    if (ray.x === 0) {
        return new Vector2(origin.x, point.y);
    }
    const k = (ray.y / ray.x) * ray.length();
    const c = origin.y - k * origin.x;
    if (axis === 'y') {
        const x = point.x;
        const y = point.x * k + c;
        return new Vector2(x, y);
    }
    else {
        const y = point.y;
        const x = (y - c) / k;
        return new Vector2(x, y);
    }
}
function rayCast(player, ray) {
    // Which cell of the grid we're in
    const mapLoc = new Vector2(Math.trunc(player.position.x), Math.trunc(player.position.y));
    // Length of ray from current position to next x or y-side
    const sideDist = Vector2.zero();
    // Length of ray from one x or y-side to the next x or y-side
    const deltaDist = new Vector2((ray.x === 0) ? Infinity : Math.abs(1 / ray.x), (ray.y === 0) ? Infinity : Math.abs(1 / ray.y));
    let perpWallDist;
    // What direction to step in x or y (either +1 or -1)
    const stepDir = Vector2.zero();
    let hit = false; // was there a wall hit?
    let side = 0; // was a NS or a EW wall hit
    // Calculate step and initial side distance
    if (ray.x < 0) {
        stepDir.x = -1;
        sideDist.x = (player.position.x - mapLoc.x) * deltaDist.x;
    }
    else {
        stepDir.x = 1;
        sideDist.x = (1 + mapLoc.x - player.position.x) * deltaDist.x;
    }
    if (ray.y < 0) {
        stepDir.y = -1;
        sideDist.y = (player.position.y - mapLoc.y) * deltaDist.y;
    }
    else {
        stepDir.y = 1;
        sideDist.y = (1 + mapLoc.y - player.position.y) * deltaDist.y;
    }
    // DDA
    while (!hit) {
        // Jump to next map square, either in x-direction, or in y-direction
        if (sideDist.x < sideDist.y) {
            sideDist.x += deltaDist.x;
            mapLoc.x += stepDir.x;
            side = 0;
        }
        else {
            sideDist.y += deltaDist.y;
            mapLoc.y += stepDir.y;
            side = 1;
        }
        // Check if ray is out of bounds
        if (mapLoc.x < 0 || mapLoc.x >= MAP_COLS ||
            mapLoc.y < 0 || mapLoc.y >= MAP_ROWS)
            return [hit, mapLoc, 0, side];
        // Check if ray has hit a wall
        if (SCENE[mapLoc.y][mapLoc.x] > 0)
            hit = true;
    }
    // Calculate distance projected on camera direction (Euclidean distance would give fisheye effect!)
    if (side === 0)
        perpWallDist = (sideDist.x - deltaDist.x);
    else
        perpWallDist = (sideDist.y - deltaDist.y);
    return [hit, mapLoc, perpWallDist, side];
}
function renderGridLines(ctx) {
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = "#303030";
    // Horizontal lines
    for (let x = 0; x <= MAP_COLS; x++) {
        strokeLine(ctx, new Vector2(x, 0), new Vector2(x, MAP_ROWS));
    }
    // Vertical lines
    for (let y = 0; y <= MAP_ROWS; y++) {
        strokeLine(ctx, new Vector2(0, y), new Vector2(MAP_COLS, y));
    }
}
function renderGridCells(ctx) {
    for (let y = 0; y < MAP_ROWS; y++) {
        for (let x = 0; x < MAP_COLS; x++) {
            if (SCENE[y][x] != 0) {
                const cellColor = new Color(...SCENE_COLORS[SCENE[y][x]]);
                ctx.fillStyle = cellColor.toString();
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }
}
function renderMinimapGrid(ctx, player, camera, position, size) {
    ctx.save();
    ctx.translate(...position.toArray());
    ctx.scale(size.x / MAP_COLS, size.y / MAP_ROWS);
    // Draw background rect
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, MAP_COLS, MAP_ROWS);
    // Draw grid cells
    renderGridCells(ctx);
    // Draw grid lines
    renderGridLines(ctx);
    // Draw player
    ctx.fillStyle = "magenta";
    fillCircle(ctx, player.position, 0.2);
    // Draw player fov
    const grad = ctx.createLinearGradient(...player.position.toArray(), ...player.position.add(player.direction).toArray());
    grad.addColorStop(0, "magenta");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(...player.position.toArray());
    ctx.lineTo(...player.position.add(player.direction).add(camera.plane).toArray());
    ctx.lineTo(...player.position.add(player.direction).sub(camera.plane).toArray());
    ctx.lineTo(...player.position.toArray());
    ctx.fill();
    ctx.restore();
}
function renderScene(ctx, player, camera) {
    ctx.save();
    const [w, h] = getCanvasSize(ctx).toArray();
    for (let x = 0; x < w; x++) {
        camera.x = 2 * (w - x) / w - 1;
        const ray = player.direction.add(camera.plane.scale(camera.x));
        const [hit, mapLoc, height, side] = rayCast(player, ray);
        if (!hit)
            continue; // If ray hits nothing, don't draw anything
        // Calculate height of line to draw on screen
        const lineHeight = Math.trunc(h / height);
        // Calculate lowest and highest pixel to fill in current stripe
        let drawStart = Math.trunc(-lineHeight / 2 + h / 2);
        if (drawStart < 0)
            drawStart = 0;
        let drawEnd = Math.trunc(lineHeight / 2 + h / 2);
        if (drawEnd >= h)
            drawEnd = h - 1;
        // Choose wall color
        let color = new Color(...SCENE_COLORS[SCENE[mapLoc.y][mapLoc.x]]);
        // Give x and y sides different brightness
        //if (side == 1) {color.setBrightness(-0.5)}
        // Draw the pixels of the stripe as a vertical line
        ctx.strokeStyle = color.setBrightness((drawEnd - drawStart) / h - 1).toString();
        ctx.beginPath();
        ctx.moveTo(x, drawStart);
        ctx.lineTo(x, drawEnd);
        ctx.stroke();
    }
    ctx.restore();
}
function update(dt, player, camera) {
    if (keysPressed['KeyW']) {
        player.move(MOV_SPEED * dt);
    }
    if (keysPressed['KeyS']) {
        player.move(-MOV_SPEED * dt);
    }
    if (keysPressed['KeyA']) {
        player.rotate(-ROT_SPEED * dt);
        camera.rotate(-ROT_SPEED * dt);
    }
    if (keysPressed['KeyD']) {
        player.rotate(ROT_SPEED * dt);
        camera.rotate(ROT_SPEED * dt);
    }
}
function render(ctx, player, camera) {
    const cellSize = ctx.canvas.width * 0.03;
    const minimapPosition = Vector2.zero().add(getCanvasSize(ctx).scale(0.03));
    const minimapSize = new Vector2(MAP_COLS, MAP_ROWS).scale(cellSize);
    // Draw background rect
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // Draw scene
    renderScene(ctx, player, camera);
    // Draw minimap
    renderMinimapGrid(ctx, player, camera, minimapPosition, minimapSize);
}
// Only execute when everything else is fully loaded
;
(() => {
    // Get canvas element
    const game = document.getElementById("game");
    if (game === null) {
        throw new Error("No canvas with id `game` is found.");
    }
    // Define canvas size
    game.width = 960;
    game.height = 720;
    // Get canvas context
    const ctx = game.getContext("2d");
    if (ctx === null) {
        throw new Error("2D content is not supported.");
    }
    const player = new Player(new Vector2(MAP_COLS, MAP_ROWS).mult(new Vector2(0.85, 0.40)), new Vector2(-1, 0));
    const camera = new Camera(new Vector2(0, 0.66));
    // Setup listeners
    window.addEventListener("keydown", (event) => {
        keysPressed[event.code] = true;
    });
    window.addEventListener("keyup", (event) => {
        delete keysPressed[event.code];
    });
    // Main game loop
    let prevTime = performance.now();
    let accumulatedFrameTime = 0;
    const gameLoop = (currentTime) => {
        if (isRunning)
            requestAnimationFrame(gameLoop);
        const elapsedTime = currentTime - prevTime;
        prevTime = currentTime;
        accumulatedFrameTime += elapsedTime;
        // Update in fixed time step
        while (accumulatedFrameTime >= frameDuration) {
            update(frameDuration / 1000, player, camera);
            accumulatedFrameTime -= frameDuration;
        }
        render(ctx, player, camera);
    };
    requestAnimationFrame(gameLoop);
})();
