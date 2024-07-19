const FPS = 60;
const frameDuration = 1000 / FPS;
let isRunning = true;
let keysPressed: {[key: string] : boolean} = {};

const MOV_SPEED = 1.2;
const ROT_SPEED = 2;

type Cell = number;

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

    static fromAngle(angle: number) : Vector2 {
        return new Vector2(Math.cos(angle), Math.sin(angle));
    }

    toArray() : [number, number] {
        return [this.x, this.y];
    }

    map(f: (n: number) => number) : Vector2 {
        return new Vector2(f(this.x), f(this.y));
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
    r: number // 0 - 255
    g: number // 0 - 255
    b: number // 0 - 255
    a: number // 0 - 1

    constructor(r: number, g: number, b: number, a: number = 1) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }

    setBrightness(factor: number) : Color {
        const newColor = new Color(0, 0, 0);

        if (factor > 1) factor = 1;
        else if (factor < -1) factor = -1;

        if (factor < 0) {
            factor += 1;
            newColor.r = this.r * factor;
            newColor.g = this.g * factor;
            newColor.b = this.b * factor;
        } else {
            newColor.r = (255 - this.r) * factor + this.r;
            newColor.g = (255 - this.g) * factor + this.g;
            newColor.b = (255 - this.b) * factor + this.b;
        }

        return newColor;
    }

    toString() : string {
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
    }
}

class Material {
    color: Color
    texture: HTMLImageElement

    constructor(color: Color, texture: HTMLImageElement) {
        this.color = color;
        this.texture = texture;
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

    move(scene: Scene, value: number) {
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

class Scene {
    cells: Array<Cell>
    width: number
    height: number
    
    constructor(cells: Array<Array<Cell>>) {
        this.height = cells.length;
        this.width = cells.reduce((a, b) => Math.max(a, b.length), 0);
        this.cells = cells.reduce((a, b) => a.concat(b), []);
    }

    size() : Vector2 {
        return new Vector2(this.width, this.height);
    }

    getCellAt(point: Vector2) : Cell | undefined {
        if (!this._isInside(point)) return undefined;

        const fpoint = point.map(Math.trunc)
        return this.cells[fpoint.y * this.width + fpoint.x];
    }

    _isInside(point: Vector2) : boolean {
        return !(point.x < 0 || point.x >= this.width || point.y < 0 || point.y >= this.height);
    }
}

const SCENE_TEXTURES: {[key: number] : string | HTMLImageElement} = {
    1: "textures/128x128/Brick/Brick_02-128x128.png",
    2: "textures/128x128/Bricks/Bricks_08-128x128.png",
    3: "textures/128x128/Metal/Metal_07-128x128.png",
    4: "textures/128x128/Plaster/Plaster_02-128x128.png",
};

function loadImage(url: string) : Promise<HTMLImageElement> {
    const image = new Image();
    image.src = url;
    return new Promise((resolve, reject) => {
        image.onload = () => resolve(image);   
        image.onerror = reject;
    });
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

function rayCast(scene: Scene, player: Player, ray: Vector2) : [boolean, Vector2, number, number, number] {
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
        if (cell === undefined) return [hit, mapLoc, -1, -1, -1];
        else if (cell > 0) hit = true;
    }

    // Calculate distance projected on camera direction (Euclidean distance would give fisheye effect!)
    let perpWallDist: number;
    if(side === 0) perpWallDist = (sideDist.x - deltaDist.x);
    else perpWallDist = (sideDist.y - deltaDist.y);

    // Calculate where exactly the wall was hit
    let wallX: number;
    if (side == 0) wallX = player.position.y + perpWallDist * ray.y;
    else wallX = player.position.x + perpWallDist * ray.x;
    wallX -= Math.floor(wallX);

    return [hit, mapLoc, perpWallDist, wallX, side];
}

function renderGridLines(ctx: CanvasRenderingContext2D, scene: Scene) {
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

function renderGridCells(ctx: CanvasRenderingContext2D, scene: Scene) {
    for (let y = 0; y < scene.height; y++) {
        for (let x = 0; x < scene.width; x++) {
            const cell = scene.getCellAt(new Vector2(x, y)) as number;
            if (cell != 0) {
                if (cell in SCENE_TEXTURES) {
                    const cellTex = SCENE_TEXTURES[cell] as HTMLImageElement;
                    ctx.drawImage(cellTex, x, y, 1, 1);
                } else {
                    const cellColor = new Color(128, 128, 128);
                    ctx.fillStyle = cellColor.toString();
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
    }
}

function renderMinimapGrid(
    ctx: CanvasRenderingContext2D,
    scene: Scene,
    player: Player, 
    camera: Camera,
    position: Vector2,
    size: Vector2
) {
    ctx.save();
    
    ctx.translate(...position.toArray());
    ctx.scale(...size.div(scene.size()).toArray());

    // Draw background rect
    ctx.fillStyle = "#181818"
    ctx.fillRect(0, 0, scene.width, scene.height);
    
    // Draw grid cells
    renderGridCells(ctx, scene);

    // Draw grid lines
    renderGridLines(ctx, scene);

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

function renderScene(ctx: CanvasRenderingContext2D, scene: Scene, player: Player, camera: Camera) {
    ctx.save();
    
    const [w, h] = getCanvasSize(ctx).toArray();

    for (let x = 0; x < w; x++) {
        camera.x = 2 * (w - x) / w - 1;
        const ray = player.direction.add(camera.plane.scale(camera.x));
        const [hit, mapLoc, height, wallX, side] = rayCast(scene, player, ray);
        if (!hit) continue; // If ray hits nothing, don't draw anything

        // Calculate height of line to draw on screen
        const lineHeight = Math.trunc(h / height);
        
        // Calculate lowest and highest pixel to fill in current stripe
        let drawStart = Math.trunc(-lineHeight / 2 + h / 2);
        if(drawStart < 0) drawStart = 0;
        let drawEnd = Math.trunc(lineHeight / 2 + h / 2);
        if(drawEnd >= h) drawEnd = h - 1;

        const cell = scene.getCellAt(mapLoc) as number;
        let color: Color
        if (cell in SCENE_TEXTURES) {
            const texture = SCENE_TEXTURES[cell] as HTMLImageElement;
            
            // Calculate texture x-coordinate
            let u = Math.floor(wallX * texture.width);
            if (side == 0 && ray.x > 0 || side == 1 && ray.y < 0) u = texture.width - u - 1;
            
            // Determine color based on what side was hit
            color = new Color(0, 0, 0, 0);
            if (side === 1) color.a += 0.5;

            // Draw image slice on the vertical strip
            ctx.drawImage(
                texture, 
                u, 0, 1, texture.height, 
                x, (h - lineHeight)*0.5, 1, lineHeight
            );
        }
        else {
            // Choose wall color
            color = new Color(128, 128, 128);

            // Give x and y sides different brightness
            if (side === 1) color = color.setBrightness(-0.5)
            
            //ctx.strokeStyle = color.setBrightness((drawEnd - drawStart) / h - 1).toString();
        }
        
        // Draw the pixels of the stripe as a vertical line
        ctx.strokeStyle = color.toString();
        ctx.beginPath();
        ctx.moveTo(x, drawStart);
        ctx.lineTo(x, drawEnd);
        ctx.stroke();
    }

    ctx.restore();
}

function update(dt: number, scene: Scene, player: Player, camera: Camera) {
    if (keysPressed['KeyW']) {
        if (keysPressed['ShiftLeft']) player.move(scene, 1.5 * MOV_SPEED * dt);
        else player.move(scene, MOV_SPEED * dt);
    } 
    if (keysPressed['KeyS']) {
        if (keysPressed['ShiftLeft']) player.move(scene, 1.5 * -MOV_SPEED * dt);
        else player.move(scene, -MOV_SPEED * dt);
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

function render(ctx: CanvasRenderingContext2D, scene: Scene, player: Player, camera: Camera) {
    const cellSize = ctx.canvas.width * 0.03;
    const minimapPosition = Vector2.zero().add(getCanvasSize(ctx).scale(0.03));
    const minimapSize = scene.size().scale(cellSize);
    
    // Draw background rect
    ctx.fillStyle = "#181818"
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw scene
    renderScene(ctx, scene, player, camera);

    // Draw minimap
    renderMinimapGrid(ctx, scene, player, camera, minimapPosition, minimapSize);
}

// Only execute when everything else is fully loaded
;(async () => {
    // Get canvas element
    const game = document.getElementById("game") as (HTMLCanvasElement | null);
    if (game === null) {
        throw new Error("No canvas with id `game` is found.")
    }

    // Define canvas size
    game.width = 960;
    game.height = 720;

    // Get canvas context
    const ctx = game.getContext("2d");
    if (ctx === null) {
        throw new Error("2D content is not supported.");
    }
    ctx.imageSmoothingEnabled = false;

    const scene = new Scene([
        [1, 1, 1, 1, 1, 4, 4, 4, 4, 4],
        [1, 0, 0, 0, 2, 0, 0, 0, 0, 4],
        [1, 0, 0, 0, 2, 0, 0, 0, 0, 4],
        [1, 0, 3, 0, 0, 0, 5, 5, 0, 1],
        [1, 0, 3, 3, 3, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 0, 0, 1, 1],
    ]);
 
    const player = new Player(
        scene.size().mult(new Vector2(0.85, 0.40)),
        new Vector2(-1, 0)
    )
    const camera = new Camera(
        new Vector2(0, 0.66)
    )

    // Load textures
    for (let id in SCENE_TEXTURES) {
        const path = SCENE_TEXTURES[id];
        SCENE_TEXTURES[id] = await loadImage(path as string);
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

    const gameLoop = (currentTime: number) => {
        if (isRunning) requestAnimationFrame(gameLoop);

        const elapsedTime = currentTime - prevTime;
        prevTime = currentTime;
        accumulatedFrameTime += elapsedTime;

        // Update in fixed time step
        while (accumulatedFrameTime >= frameDuration) {
            update(frameDuration / 1000, scene, player, camera);
            accumulatedFrameTime -= frameDuration;
        }

        render(ctx, scene, player, camera);
    }

    requestAnimationFrame(gameLoop);
})()
