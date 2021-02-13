import clamp    from 'clamp'
import html     from 'snabby'
import { Howl } from 'howler'


const TRANSITION_TABLE = {
    initializing: {
        'READY': 'locked'
    },
    locked: {
        'GRASP': 'unlocking'
    },
    unlocking: {
        'DONE': 'unlocked',
        'RELEASE': 'winding'
    },
    unlocked: {
        'GRASP': 'locking'
    },
    locking: {
        'DONE': 'locked',
        'RELEASE': 'unwinding'
    },
    unwinding: {
        'DONE': 'unlocked'
    },
    winding: {
        'DONE': 'locked'
    }
}

const STATE_ENTRY_FUNCTIONS = {
    unwinding: function (model, update) {
        const frameRate = 1 / 60
        const frameDelay = frameRate * 1000

        let interval

        const step = function () {
            const { b, k, block, spring_length } = model.spring

            const F_spring = k * ( model.angle - spring_length )
            //const F_spring = k * ( (block.x - wallWidth) - spring_length )
            const F_damper = b * block.v

            const a = ( F_spring + F_damper ) / block.mass
            block.v += a * frameRate
            //block.x += block.v * frameRate

            model.angle = clamp(model.angle + block.v * frameRate, 1, 89)

            if (Math.floor(model.angle) % 2 === 0)
                _playSound(model.sounds, 'click')

            update()

            if (model.angle === 1) {
                clearInterval(interval)
                _raiseEvent('DONE', model, update)
            }
        }

        interval = setInterval(step, frameDelay, model)
    },
    winding: function (model, update) {
        const frameRate = 1 / 60
        const frameDelay = frameRate * 1000

        let interval

        const step = function () {
            const { b, k, block, spring_length } = model.spring

            const F_spring = k * ( model.angle - spring_length )
            //const F_spring = k * ( (block.x - wallWidth) - spring_length )
            const F_damper = b * block.v

            const a = ( F_spring + F_damper ) / block.mass
            block.v += a * frameRate
            //block.x += block.v * frameRate

            model.angle = clamp(model.angle - block.v * frameRate, 1, 89)

            if (Math.floor(model.angle) % 4 === 0)
                _playSound(model.sounds, 'click')

            update()

            if (model.angle === 89) {
                clearInterval(interval)
                _raiseEvent('DONE', model, update)
            }
        }

        interval = setInterval(step, frameDelay, model)
    }
}


const MOUSE_MOVEMENT_FUNCTIONS = {
    unlocking: function (ev, model, update) {
        const newAngle = _getAngle(model.elm, ev)
        if (newAngle < model.angle) {
            model.angle = newAngle
            if (Math.floor(model.angle) % 4 === 0)
                _playSound(model.sounds, 'click')
            update()
        }

        if (model.angle === 1) {
            _playSound(model.sounds, 'done')
            _raiseEvent('DONE', model, update)
        }
    },
    locking: function (ev, model, update) {
        const newAngle = _getAngle(model.elm, ev)
        if (newAngle > model.angle) {
            model.angle = newAngle
            if (Math.floor(model.angle) % 4 === 0)
                _playSound(model.sounds, 'click')
            update()
        }

        if (model.angle === 89) {
            _playSound(model.sounds, 'done')
            _raiseEvent('DONE', model, update)
        }
    }
}


function _playSound (sounds, type) {
    const s = sounds ? sounds[type] : undefined
    if (s && s.length)
        s[Math.floor(Math.random() * s.length)].play()
}


function _getAngle (elm, ev) {
    const rect = elm.getBoundingClientRect()
    const x = clamp(ev.clientX - rect.left, 0, rect.width)
    const y = clamp(ev.clientY - rect.top, 0, rect.height)

    // calculate the rotation point for the handle in absolute coordinates
    const scaleX = rect.width / 280
    const scaleY = rect.height / 280

    const centerX = 200 * scaleX
    const centerY = 172 * scaleY

    // get the angle of rotation
    const dx = x - centerX
    const dy = y - centerY

    return clamp(Math.atan2(-dy, -dx) * 180 / Math.PI, 1, 89)
}


function _raiseEvent (eventName, model, update) {
    const newState = TRANSITION_TABLE[model.state][eventName]
    if (!newState || model.state === newState)
        return

    model.state = newState

    if (STATE_ENTRY_FUNCTIONS[newState])
        STATE_ENTRY_FUNCTIONS[newState](model, update)
}


function init (options={}) {
    let sounds

    if (options.sounds && (options.sounds.click || options.sounds.done)) {
        sounds = { }

        if (options.sounds.click)
            sounds.click = options.sounds.click.map((s) => new Howl({ src: [ s ] }) )
        
        if (options.sounds.done)
            sounds.done = options.sounds.done.map((s) => new Howl({ src: [ s ] }) )
    }

    return {
        elm: undefined,
        angle: 89,
        state: 'initializing',  // initializing | locked | unlocked | unlocking | locking | unwinding
        spring: {
            // spring stiffness, in kg / s^2
            k: -77,

            // the at-rest spring length
            spring_length: 0,

            // damping constant, in kg / s
            b: -9.9,

            // block position and velocity.
            block: {
                v: 0, mass: 3.0
            }
        },
        sounds
    }
}


function view (model, update) {

    const _insertHook = function (vnode) {
        model.elm = vnode.elm
        _raiseEvent('READY', model, update)
    }

    const _mouseDown = function () {
        _raiseEvent('GRASP', model, update)
        document.addEventListener('mousemove', _mouseMove, { passive: true })
        document.addEventListener('mouseup', _mouseUp)
    }

    const _mouseMove = function (ev) {
        if (MOUSE_MOVEMENT_FUNCTIONS[model.state])
            MOUSE_MOVEMENT_FUNCTIONS[model.state](ev, model, update)
    }

    const _mouseUp = function () {
        _raiseEvent('RELEASE', model, update)
        document.removeEventListener('mousemove', _mouseMove)
        document.removeEventListener('mouseup', _mouseUp)
    }

    return html`<svg viewBox="0 0 280 280"
                     @hook:insert=${_insertHook}
                     style="cursor: pointer; box-sizing: border-box; margin: 0px; padding: 0px; overflow: hidden; width: 300px; height: 300px; background-color: whitesmoke;">

        <circle cx="200" cy="172" r="42" fill="rgb(202 99 89)"
                stroke="rgba(175, 174, 174, 0.9)"
                stroke-width="16"
                style="pointer-events: none;"/>

        <g class="handle"
           fill="rgb(235,119,82)"
           transform="rotate(${model.angle}, 200, 172)"
           @on:mousedown=${_mouseDown}>
            <rect x="45" y="140" width="24" height="24" rx="10"/>

            <circle cx="200" cy="172" r="16"/>
            <path d="M 57 140  L 150 140  L 204 156  L 197 188  L 146 164  L 57 164"/>

            <rect x="57" y="148" width="87" height="8" rx="2" fill="rgb(229,97,65)"/>
        </g>

    </svg>`
}


function destroy (model) {
    if (model.sounds) {
        // TODO: cleanup sounds
    }
}


export default { init, view, destroy }
