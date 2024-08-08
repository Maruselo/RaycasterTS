"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const GAME_SCALE = 40;
const GAME_WIDTH = GAME_SCALE * 4;
const GAME_HEIGHT = GAME_SCALE * 3;
const FPS = 60;
const frameDuration = 1000 / FPS;
let isRunning = true;
let keysPressed = {};
const MOV_SPEED = 1.6;
const ROT_SPEED = 2;
class Vector2 {
    constructor(x, y) {
        if (y === undefined)
            y = x;
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
    map(f) {
        return new Vector2(f(this.x), f(this.y));
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
    sqrLength() {
        return this.x * this.x + this.y * this.y;
    }
    sqrDistanceTo(vector) {
        return vector.sub(this).sqrLength();
    }
    norm() {
        const l = this.length();
        if (l === 0)
            return new Vector2(0, 0);
        return new Vector2(this.x / l, this.y / l);
    }
    cross(vector) {
        return (this.x * vector.y) - (this.y * vector.x);
    }
    scale(k) {
        return new Vector2(this.x * k, this.y * k);
    }
    rotate(angle) {
        return new Vector2(this.x * Math.cos(angle) - this.y * Math.sin(angle), this.x * Math.sin(angle) + this.y * Math.cos(angle));
    }
}
class Color {
    constructor(r, g, b, a = 1.0) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
    setBrightness(factor) {
        return new Color(this.r * factor, this.g * factor, this.b * factor);
    }
    toString() {
        return `rgba(${this.r * 255}, ${this.g * 255}, ${this.b * 255}, ${this.a})`;
    }
}
class Material {
    constructor(color, texture) {
        this.color = color;
        this.texture = texture;
    }
}
class Player {
    constructor(position, direction) {
        this.position = position;
        this.direction = direction;
        this.size = new Vector2(0.5);
    }
    rotate(value) {
        this.direction = this.direction.rotate(value);
    }
    move(scene, value) {
        const newMapLoc = this.position.add(this.direction.scale(value));
        // Horizontal movement with boundary and wall collision check
        if (scene.getCellAt(new Vector2(newMapLoc.x, Math.trunc(this.position.y))) === 0)
            this.position.x += this.direction.x * value;
        // Vertical movement with boundary wall collision check
        if (scene.getCellAt(new Vector2(Math.trunc(this.position.x), newMapLoc.y)) === 0)
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
class Scene {
    constructor(cells) {
        this.height = cells.length;
        this.width = cells.reduce((a, b) => Math.max(a, b.length), 0);
        this.cells = cells.reduce((a, b) => a.concat(b), []);
    }
    size() {
        return new Vector2(this.width, this.height);
    }
    getCellAt(point) {
        if (!this._isInside(point))
            return undefined;
        const fpoint = point.map(Math.trunc);
        return this.cells[fpoint.y * this.width + fpoint.x];
    }
    _isInside(point) {
        return !(point.x < 0 || point.x >= this.width || point.y < 0 || point.y >= this.height);
    }
}
const SCENE_TEXTURES = {
    //1: "textures/128x128/Brick/Brick_02-128x128.png",
    //2: "textures/128x128/Bricks/Bricks_08-128x128.png",
    //3: "textures/128x128/Metal/Metal_07-128x128.png",
    //4: "textures/128x128/Plaster/Plaster_02-128x128.png",
    5: "textures/floor.png",
};
function loadImage(url) {
    const image = new Image();
    image.src = url;
    return new Promise((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = reject;
    });
}
function loadImageData(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const image = yield loadImage(url);
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext("2d");
        if (ctx === null)
            throw new Error("2D content is not supported.");
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, image.width, image.height);
    });
}
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
function floorRayCast(player, currY, rayLeft, rayRight) {
    // Current y position compared to the center of the screen (the horizon)
    const p = Math.trunc(currY - GAME_HEIGHT / 2);
    // Vertical position of the camera
    const posZ = 0.5 * GAME_HEIGHT;
    // Horizontal distance from the camera to the floor for the current row.
    // 0.5 is the z position exactly in the middle between floor and ceiling.
    const rowDist = posZ / p;
    // Calculate the real world step vector we have to add for each x (parallel to camera plane)
    // adding step by step avoids multiplications with a weight in the inner loop
    const floorStep = rayRight.sub(rayLeft).scale(rowDist / GAME_WIDTH);
    // real world coordinates of the leftmost column. This will be updated as we step to the right.
    const floor = player.position.add(rayLeft.scale(rowDist));
    return [floor, floorStep];
}
function wallRayCast(scene, player, ray) {
    // Which cell of the grid we're in
    const mapLoc = player.position.map(Math.trunc);
    // Length of ray from current position to next x or y-side
    const sideDist = Vector2.zero();
    // Length of ray from one x or y-side to the next x or y-side
    const deltaDist = ray.map((n) => n === 0 ? Infinity : Math.abs(1 / n));
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
        // Check if ray has hit a wall, exit if it's out of bounds
        const cell = scene.getCellAt(mapLoc);
        if (cell === undefined)
            return [hit, mapLoc, -1, -1, -1];
        else if (cell > 0)
            hit = true;
    }
    // Calculate distance projected on camera direction (Euclidean distance would give fisheye effect!)
    let perpWallDist;
    if (side === 0)
        perpWallDist = sideDist.x - deltaDist.x;
    else
        perpWallDist = sideDist.y - deltaDist.y;
    // Calculate where exactly the wall was hit
    let wallX;
    if (side == 0)
        wallX = player.position.y + perpWallDist * ray.y;
    else
        wallX = player.position.x + perpWallDist * ray.x;
    wallX -= Math.floor(wallX);
    return [hit, mapLoc, perpWallDist, wallX, side];
}
function renderGridLines(ctx, scene) {
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = "#303030";
    // Horizontal lines
    for (let x = 0; x <= scene.width; x++) {
        strokeLine(ctx, new Vector2(x, 0), new Vector2(x, scene.height));
    }
    // Vertical lines
    for (let y = 0; y <= scene.height; y++) {
        strokeLine(ctx, new Vector2(0, y), new Vector2(scene.width, y));
    }
}
function renderGridCells(ctx, scene) {
    for (let y = 0; y < scene.height; y++) {
        for (let x = 0; x < scene.width; x++) {
            const cell = scene.getCellAt(new Vector2(x, y));
            if (cell != 0) {
                if (cell in SCENE_TEXTURES) {
                    const cellTex = SCENE_TEXTURES[cell];
                    //ctx.drawImage(cellTex, x, y, 1, 1);
                }
                else {
                    const cellColor = new Color(128, 128, 128);
                    ctx.fillStyle = cellColor.toString();
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
    }
}
function renderMinimapGrid(ctx, scene, player, camera, position, size) {
    ctx.save();
    ctx.translate(...position.toArray());
    ctx.scale(...size.div(scene.size()).toArray());
    // Draw background rect
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, scene.width, scene.height);
    // Draw grid cells
    renderGridCells(ctx, scene);
    // Draw grid lines
    renderGridLines(ctx, scene);
    // Draw player
    ctx.fillStyle = "magenta";
    //fillCircle(ctx, player.position, 0.2);
    ctx.fillRect(...player.position.sub(player.size.scale(0.5)).toArray(), ...player.size.toArray());
    // Draw player fov
    const grad = ctx.createLinearGradient(...player.position.toArray(), ...player.position.add(player.direction).toArray());
    grad.addColorStop(0, "magenta");
    grad.addColorStop(1, "transparent");
    ctx.strokeStyle = "magenta";
    //ctx.beginPath();
    //ctx.moveTo(...player.position.toArray());
    //ctx.lineTo(...player.position.add((player.direction.mult(new Vector2(-1, -1)))).sub(camera.plane).toArray());
    //ctx.lineTo(...player.position.add((player.direction.mult(new Vector2(-1, -1)))).add(camera.plane).toArray());
    //ctx.lineTo(...player.position.toArray());
    //ctx.stroke();
    strokeLine(ctx, player.position, player.position.add(player.direction));
    ctx.restore();
}
function renderWalls(buffer, scene, player, camera) {
    const [w, h] = [GAME_WIDTH, GAME_HEIGHT];
    for (let x = 0; x < w; x++) {
        camera.x = 2 * x / w - 1;
        const ray = player.direction.add(camera.plane.scale(camera.x));
        const [hit, mapLoc, height, wallX, side] = wallRayCast(scene, player, ray);
        if (!hit)
            continue; // If ray hits nothing, skip drawing
        // Calculate height of line to draw on screen
        const lineHeight = Math.trunc(h / height);
        // Calculate lowest and highest pixel to fill in current stripe
        let drawStart = Math.trunc(-lineHeight / 2 + h / 2);
        if (drawStart < 0)
            drawStart = 0;
        let drawEnd = Math.trunc(lineHeight / 2 + h / 2);
        if (drawEnd >= h - 1)
            drawEnd = h - 1;
        const cell = scene.getCellAt(mapLoc);
        if (cell in SCENE_TEXTURES) {
            const texture = SCENE_TEXTURES[cell];
            // Calculate texture x-coordinate
            let u = Math.trunc(wallX * texture.width);
            if ((side == 0 && ray.x > 0) || (side == 1 && ray.y < 0))
                u = texture.width - u - 1;
            // How much to increase the texture coordinate per screen pixel
            const step = texture.height / (lineHeight + 2);
            // Starting texture coordinate
            let texPos = (drawStart - h / 2 + lineHeight / 2) * step;
            for (let y = drawStart - 1; y <= drawEnd; y++) {
                const v = Math.trunc(texPos) & (texture.height - 1);
                texPos += step;
                const srcP = (v * texture.width + u) * 4;
                const dstP = (y * w + x) * 4;
                buffer.data[dstP + 0] = texture.data[srcP + 0] / Math.max(height, 0.8);
                buffer.data[dstP + 1] = texture.data[srcP + 1] / Math.max(height, 0.8);
                buffer.data[dstP + 2] = texture.data[srcP + 2] / Math.max(height, 0.8);
                buffer.data[dstP + 3] = texture.data[srcP + 3];
            }
        }
        else {
            // Choose wall color
            let color = new Color(128, 128, 128);
            // Give x and y sides different brightness
            if (side === 1)
                color = color.setBrightness(-0.5);
            for (let y = drawStart - 1; y <= drawEnd; y++) {
                buffer.data[(y * w + x) * 4 + 0] = color.r;
                buffer.data[(y * w + x) * 4 + 1] = color.g;
                buffer.data[(y * w + x) * 4 + 2] = color.b;
                buffer.data[(y * w + x) * 4 + 3] = color.a * 255;
            }
        }
    }
}
function renderFloor(buffer, player, camera) {
    const [w, h] = [GAME_WIDTH, GAME_HEIGHT];
    //const texture = SCENE_TEXTURES[5] as ImageData;
    let floorColor;
    let floorColor1 = new Color(0.094, 0.094 + 0.05, 0.094 + 0.05);
    let floorColor2 = new Color(0.188, 0.188 + 0.05, 0.188 + 0.05);
    // Leftmost ray (x = 0) and rightmost ray (x = w)
    const rayLeft = player.direction.sub(camera.plane);
    const rayRight = player.direction.add(camera.plane);
    for (let y = h / 2 + 1; y < h; y++) {
        let [floor, step] = floorRayCast(player, y, rayLeft, rayRight);
        for (let x = 0; x < w; x++) {
            const cell = floor.map(Math.trunc);
            // const u = Math.trunc(texture.width * (floor.x - cell.x)) & (texture.width - 1);
            // const v = Math.trunc(texture.height * (floor.y - cell.y)) & (texture.height - 1);
            floor = floor.add(step);
            // // Floor
            // buffer.data[(y * w + x) * 4 + 0] = texture.data[(v * texture.width + u) * 4 + 0];
            // buffer.data[(y * w + x) * 4 + 1] = texture.data[(v * texture.width + u) * 4 + 1];
            // buffer.data[(y * w + x) * 4 + 2] = texture.data[(v * texture.width + u) * 4 + 2];
            // buffer.data[(y * w + x) * 4 + 3] = texture.data[(v * texture.width + u) * 4 + 3];
            if ((cell.x + cell.y) % 2) {
                floorColor = floorColor1;
            }
            else {
                floorColor = floorColor2;
            }
            const fogFactor = Math.sqrt(player.position.sqrDistanceTo(floor));
            floorColor = floorColor.setBrightness(fogFactor);
            // Floor
            const floorDest = (y * w + x) * 4;
            buffer.data[floorDest + 0] = floorColor.r * 255;
            buffer.data[floorDest + 1] = floorColor.g * 255;
            buffer.data[floorDest + 2] = floorColor.b * 255;
            buffer.data[floorDest + 3] = floorColor.a * 255;
        }
    }
}
function renderCeiling(buffer, player, camera) {
    const [w, h] = [GAME_WIDTH, GAME_HEIGHT];
    let ceilingColor;
    let ceilingColor1 = new Color(0.094 + 0.05, 0.094, 0.094);
    let ceilingColor2 = new Color(0.188 + 0.05, 0.188, 0.188);
    // Leftmost ray (x = 0) and rightmost ray (x = w)
    const rayLeft = player.direction.sub(camera.plane);
    const rayRight = player.direction.add(camera.plane);
    for (let y = h / 2 + 1; y < h; y++) {
        let [floor, step] = floorRayCast(player, y, rayLeft, rayRight);
        for (let x = 0; x < w; x++) {
            const cell = floor.map(Math.trunc);
            // const u = Math.trunc(texture.width * (floor.x - cell.x)) & (texture.width - 1);
            // const v = Math.trunc(texture.height * (floor.y - cell.y)) & (texture.height - 1);
            floor = floor.add(step);
            // // Ceiling
            // buffer.data[((h - y - 1) * w + x) * 4 + 0] = texture.data[(v * texture.width + u) * 4 + 0];
            // buffer.data[((h - y - 1) * w + x) * 4 + 1] = texture.data[(v * texture.width + u) * 4 + 1];
            // buffer.data[((h - y - 1) * w + x) * 4 + 2] = texture.data[(v * texture.width + u) * 4 + 2];
            // buffer.data[((h - y - 1) * w + x) * 4 + 3] = texture.data[(v * texture.width + u) * 4 + 3];
            if ((cell.x + cell.y) % 2) {
                ceilingColor = ceilingColor1;
            }
            else {
                ceilingColor = ceilingColor2;
            }
            const fogFactor = Math.sqrt(player.position.sqrDistanceTo(floor));
            ceilingColor = ceilingColor.setBrightness(fogFactor);
            // Ceiling
            const ceilingDest = ((h - y - 1) * w + x) * 4;
            buffer.data[ceilingDest + 0] = ceilingColor.r * 255;
            buffer.data[ceilingDest + 1] = ceilingColor.g * 255;
            buffer.data[ceilingDest + 2] = ceilingColor.b * 255;
            buffer.data[ceilingDest + 3] = ceilingColor.a * 255;
        }
    }
}
function renderScene(buffer, scene, player, camera) {
    renderCeiling(buffer, player, camera);
    renderFloor(buffer, player, camera);
    renderWalls(buffer, scene, player, camera);
}
function render(buffer, scene, player, camera) {
    buffer.data.fill(255);
    //const cellSize = ctx.canvas.width * 0.03;
    //const minimapPosition = Vector2.zero().add(getCanvasSize(ctx).scale(0.03));
    //const minimapSize = scene.size().scale(cellSize);
    // Draw scene
    renderScene(buffer, scene, player, camera);
    // Draw minimap
    //renderMinimapGrid(ctx, scene, player, camera, minimapPosition, minimapSize);
}
function update(dt, scene, player, camera) {
    if (keysPressed['KeyW']) {
        if (keysPressed['ShiftLeft'])
            player.move(scene, 1.5 * MOV_SPEED * dt);
        else
            player.move(scene, MOV_SPEED * dt);
    }
    if (keysPressed['KeyS']) {
        if (keysPressed['ShiftLeft'])
            player.move(scene, 1.5 * -MOV_SPEED * dt);
        else
            player.move(scene, -MOV_SPEED * dt);
    }
    if (keysPressed['KeyA']) {
        player.rotate(ROT_SPEED * dt);
        camera.rotate(ROT_SPEED * dt);
    }
    if (keysPressed['KeyD']) {
        player.rotate(-ROT_SPEED * dt);
        camera.rotate(-ROT_SPEED * dt);
    }
}
// Only execute when everything else is fully loaded
;
(() => __awaiter(void 0, void 0, void 0, function* () {
    // Get canvas element
    const game = document.getElementById("game");
    if (game === null) {
        throw new Error("No canvas with id `game` is found.");
    }
    // Define canvas size
    game.width = GAME_WIDTH;
    game.height = GAME_HEIGHT;
    // Get canvas context
    const ctx = game.getContext("2d");
    if (ctx === null) {
        throw new Error("2D content is not supported.");
    }
    ctx.imageSmoothingEnabled = false;
    ctx.font = "12px monospace";
    // Define back buffer
    const buffer = new ImageData(GAME_WIDTH, GAME_HEIGHT);
    const bufferCanvas = new OffscreenCanvas(GAME_WIDTH, GAME_HEIGHT);
    const bufferCanvasCtx = bufferCanvas.getContext("2d");
    if (bufferCanvasCtx === null) {
        throw new Error("2D content is not supported.");
    }
    bufferCanvasCtx.imageSmoothingEnabled = false;
    const scene = new Scene([
        [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
        [5, 0, 0, 0, 5, 0, 0, 0, 0, 5],
        [5, 0, 0, 0, 5, 0, 0, 0, 0, 5],
        [5, 0, 5, 0, 0, 0, 5, 5, 0, 5],
        [5, 0, 5, 5, 5, 0, 0, 0, 0, 5],
        [5, 0, 0, 0, 0, 0, 0, 0, 0, 5],
        [5, 5, 5, 5, 5, 5, 0, 0, 5, 5],
    ]);
    const player = new Player(scene.size().mult(new Vector2(0.63, 0.63)), new Vector2(-1, 0));
    const camera = new Camera(new Vector2(0, 0.66));
    // Load textures
    for (let id in SCENE_TEXTURES) {
        const path = SCENE_TEXTURES[id];
        SCENE_TEXTURES[id] = yield loadImageData(path);
    }
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
            update(frameDuration / 1000, scene, player, camera);
            accumulatedFrameTime -= frameDuration;
        }
        render(buffer, scene, player, camera);
        bufferCanvasCtx.putImageData(buffer, 0, 0);
        ctx.drawImage(bufferCanvas, 0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillText(`${Math.floor(1000 / elapsedTime)} FPS`, 1, 10, 36);
    };
    requestAnimationFrame(gameLoop);
}))();
const isDev = window.location.hostname === "localhost";
if (isDev) {
    const ws = new WebSocket("ws://localhost:6970");
    ws.addEventListener("message", (event) => {
        if (event.data === "reload") {
            window.location.reload();
        }
    });
}
