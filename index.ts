const FPS = 60;
const frameDuration = 1000 / FPS;
let isRunning = true;
let keysPressed: {[key: string] : boolean} = {};

const MOV_SPEED = 1.2;
const ROT_SPEED = 2;

const MAP_ROWS = 7;
const MAP_COLS = 10;
const SCENE = [
    [1, 1, 1, 1, 2, 4, 4, 4, 4, 1],
    [1, 0, 0, 0, 2, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 2, 0, 0, 0, 0, 1],
    [1, 0, 3, 3, 3, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];
type Scene = Array<Array<number>>;

class Vector2 {
    x: number;
    y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    static zero() : Vector2 {
        return new Vector2(0, 0);
    }

    static fromAngle(angle: number): Vector2 {
        return new Vector2(Math.cos(angle), Math.sin(angle));
    }

    toArray() : [number, number] {
        return [this.x, this.y];
    }

    add(vector: Vector2) : Vector2 {
        return new Vector2(this.x + vector.x, this.y + vector.y);
    }

    sub(vector: Vector2) : Vector2 {
        return new Vector2(this.x - vector.x, this.y - vector.y);
    }

    div(vector: Vector2) : Vector2 {
        return new Vector2(this.x / vector.x, this.y / vector.y);
    }

    mult(vector: Vector2) : Vector2 {
        return new Vector2(this.x * vector.x, this.y * vector.y);
    }

    length() : number {
       return Math.sqrt(this.x*this.x + this.y*this.y);
    }

    norm() : Vector2 {
        const l = this.length();
        if(l === 0) return new Vector2(0, 0);
        return new Vector2(this.x / l, this.y / l);
    }

    scale(k: number) : Vector2 {
        return new Vector2(this.x * k, this.y * k);
    }

    rotate(angle: number) : Vector2 {
        return new Vector2(
            this.x * Math.cos(angle) - this.y * Math.sin(angle),
            this.x * Math.sin(angle) + this.y * Math.cos(angle)
        );
    }
}

class Vector3 {
    x: number;
    y: number;
    z: number;

    constructor(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    toArray() : [number, number, number] {
        return [this.x, this.y, this.z];
    }

    scale(k: number) : Vector3 {
        return new Vector3(this.x * k, this.y * k, this.z * k);
    }
}

class Color {
    rgb: Vector3
    a: number

    get r() {
        return this.rgb.x;
    }
    get g() {
        return this.rgb.y;
    }
    get b() {
        return this.rgb.z;
    }

    set r(value) {
        this.rgb.x = value;
    }
    set g(value) {
        this.rgb.y = value;
    }
    set b(value) {
        this.rgb.z = value;
    }

    constructor(r: number, g: number, b: number, a: number = 1) {
        this.rgb = new Vector3(r, g, b);
        this.a = a;
    }

    toString() : string {
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
    }
}

class Player {
    position: Vector2
    direction: Vector2

    constructor(position: Vector2, direction: Vector2) {
        this.position = position;
        this.direction = direction;
    }

    rotate(value: number) {
        this.direction = this.direction.rotate(value);
    }

    move(value: number) {
        this.position = this.position.add(this.direction.scale(value));
    }
}

class Camera {
    plane: Vector2
    x: number

    constructor(plane: Vector2, x: number = 0) {
        this.plane = plane;
        this.x = x;
    }

    rotate(value: number) {
        this.plane = this.plane.rotate(value);
    }
}

const SCENE_COLORS : {[key: number] : [number, number, number]} = {
    1: [255, 0, 0],
    2: [0, 255, 0],
    3: [0, 0, 255],
    4: [255, 255, 255],
}

function fillCircle(ctx: CanvasRenderingContext2D, center: Vector2, radius: number) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, 2*Math.PI);
    ctx.fill();
}

function strokeLine(ctx: CanvasRenderingContext2D, start: Vector2, end: Vector2) {
    ctx.beginPath();
    ctx.moveTo(...start.toArray());
    ctx.lineTo(...end.toArray());
    ctx.stroke();
}

function getCanvasSize(ctx: CanvasRenderingContext2D) : Vector2 {
    return new Vector2(ctx.canvas.width, ctx.canvas.height);
}

function snapToGrid(ray: Vector2, point: Vector2, origin: Vector2, axis: string) : Vector2 {
    if (ray.x === 0) {
        return new Vector2(origin.x, point.y);
    }
    const k = (ray.y / ray.x) * ray.length();
    const c = origin.y - k * origin.x;

    if (axis === 'y') {
        const x = point.x;
        const y = point.x * k + c;
        return new Vector2(x, y);
    } else {
        const y = point.y;
        const x = (y - c) / k;
        return new Vector2(x, y);
    }
}

function rayCast(player: Player, ray: Vector2): [Vector2, number, number] {
    // Which cell of the grid we're in
    const mapLoc = new Vector2(Math.trunc(player.position.x), Math.trunc(player.position.y));
     
    // Length of ray from current position to next x or y-side
    const sideDist = Vector2.zero();

    // Length of ray from one x or y-side to the next x or y-side
    const deltaDist = new Vector2(
        (ray.x === 0) ? Infinity : Math.abs(1 / ray.x),
        (ray.y === 0) ? Infinity : Math.abs(1 / ray.y)
    );
    let perpWallDist: number;

    // What direction to step in x or y (either +1 or -1)
    const stepDir = Vector2.zero();

    let hit = 0; // was there a wall hit?
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

        // Check if ray has hit a wall
        if (SCENE[mapLoc.y][mapLoc.x] > 0) hit = 1;
    }

    // Calculate distance projected on camera direction (Euclidean distance would give fisheye effect!)
    if(side === 0) perpWallDist = (sideDist.x - deltaDist.x);
    else perpWallDist = (sideDist.y - deltaDist.y);

    return [mapLoc, perpWallDist, side];
}

function renderGridLines(ctx: CanvasRenderingContext2D) {
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

function renderGridCells(ctx: CanvasRenderingContext2D) {
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

function renderMinimapGrid(
    ctx: CanvasRenderingContext2D, 
    player: Player, 
    camera: Camera,
    position: Vector2,
    size: Vector2
) {
    ctx.save();
    
    ctx.translate(...position.toArray());
    ctx.scale(size.x / MAP_COLS, size.y / MAP_ROWS);

    // Draw background rect
    ctx.fillStyle = "#181818"
    ctx.fillRect(0, 0, MAP_COLS, MAP_ROWS);
    
    // Draw grid cells
    renderGridCells(ctx);

    // Draw grid lines
    renderGridLines(ctx);

    // Draw player
    ctx.fillStyle = "magenta";
    fillCircle(ctx, player.position, 0.2);

    // Draw player fov
    const grad = ctx.createLinearGradient(
        ...player.position.toArray(), 
        ...player.position.add(player.direction).toArray()
    );
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

function renderScene(ctx: CanvasRenderingContext2D, player: Player, camera: Camera) {
    ctx.save();
    
    const [w, h] = getCanvasSize(ctx).toArray();

    for (let x = 0; x < w; x++) {
        camera.x = 2 * (w - x) / w - 1;
        const ray = player.direction.add(camera.plane.scale(camera.x));
        const [mapLoc, height, side] = rayCast(player, ray);

        // Calculate height of line to draw on screen
        const lineHeight = Math.trunc(h / height);
        
        // Calculate lowest and highest pixel to fill in current stripe
        let drawStart = Math.trunc(-lineHeight / 2 + h / 2);
        if(drawStart < 0) drawStart = 0;
        let drawEnd = Math.trunc(lineHeight / 2 + h / 2);
        if(drawEnd >= h) drawEnd = h - 1;

        // Choose wall color
        let color = new Color(...SCENE_COLORS[SCENE[mapLoc.y][mapLoc.x]]);

        // Give x and y sides different brightness
        if (side == 1) {color.rgb = color.rgb.scale(0.5)}

        // Draw the pixels of the stripe as a vertical line
        ctx.strokeStyle = color.toString();
        ctx.beginPath();
        ctx.moveTo(x, drawStart);
        ctx.lineTo(x, drawEnd);
        ctx.stroke();
    }

    ctx.restore();
}

function update(dt: number, player: Player, camera: Camera) {
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

function render(ctx: CanvasRenderingContext2D, player: Player, camera: Camera) {
    const cellSize = ctx.canvas.width * 0.03;
    const minimapPosition = Vector2.zero().add(getCanvasSize(ctx).scale(0.03));
    const minimapSize = new Vector2(MAP_COLS, MAP_ROWS).scale(cellSize);
    
    // Draw background rect
    ctx.fillStyle = "#181818"
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw scene
    renderScene(ctx, player, camera);

    // Draw minimap
    renderMinimapGrid(ctx, player, camera, minimapPosition, minimapSize);
}

// Only execute when everything else is fully loaded
;(() => {
    // Get canvas element
    const game = document.getElementById("game") as (HTMLCanvasElement | null);
    if (game === null) {
        throw new Error("No canvas with id `game` is found.")
    }

    // Define canvas size
    game.width = 640;
    game.height = 480;

    // Get canvas context
    const ctx = game.getContext("2d");
    if (ctx === null) {
        throw new Error("2D content is not supported.");
    }

    const player = new Player(
        new Vector2(MAP_COLS, MAP_ROWS).mult(new Vector2(0.85, 0.40)),
        new Vector2(-1, 0)
    )
    const camera = new Camera(
        new Vector2(0, 0.66)
    )

    // Setup listeners
    window.addEventListener("keydown", (event) => {
        keysPressed[event.code] = true;
    });
    window.addEventListener("keyup", (event) => {
        keysPressed[event.code] = false;
    });

    // Main game loop
    let prevTime = performance.now();
    let accumulatedFrameTime = 0;

    function gameLoop(currentTime: number) {
        if (isRunning) requestAnimationFrame(gameLoop);
        
        const elapsedTime = currentTime - prevTime;
        prevTime = currentTime;
        accumulatedFrameTime += elapsedTime;

        while (accumulatedFrameTime >= frameDuration) {
            update(frameDuration / 1000, player, camera);
            accumulatedFrameTime -= frameDuration;
        }

        if (ctx !== null) render(ctx, player, camera);
    }

    requestAnimationFrame(gameLoop);
})()
