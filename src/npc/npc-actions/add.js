import {callEvent} from '../../API'
import {decodeGif, GIF_FRAME_DISPOSAL} from '../../utility-functions'
import {addDialogToDialogList, openDialog} from '../dialog'
import {customNpcs} from '../npc'
import {removeCollision, setCollision} from './collision'
import {removeNpc} from './remove'

function createClickWrapper(npc, clickHandler)
{
    return function (event)
    {
        if (Math.abs(npc.x - hero.x) > 1 || Math.abs(npc.y - hero.y) > 1)
            hero.mClick(event)
        else
            clickHandler()
    }
}

export function addNpc(npc)
{
    if (INTERFACE === 'NI')
    {
        const data = {}
        data[npc.id] = {...npc}

        const collisionBefore = Engine.map.col.check(npc.x, npc.y)
        const npcIcon = npc.icon

        if (npcIcon.endsWith('gif'))
        {
            if (npcIcon.startsWith('https://micc.garmory-cdn.cloud/obrazki/npc/'))
            {
                data[npc.id].icon = npcIcon.substring(43)
                Engine.npcs.updateData(data)
            }
            else if (npcIcon.startsWith('https://micc.garmory-cdn.cloud/obrazki/'))
            {
                const aNpath = window.CFG.r_npath
                const regex = /^https:\/\/micc\.garmory-cdn\.cloud\/obrazki\/(.+?)\//
                const arr = regex.exec(npcIcon)
                window.CFG.r_npath = `/obrazki/${arr[1]}/`
                data[npc.id].icon = npcIcon.replace(regex, '')

                Engine.npcs.updateData(data)
                window.CFG.r_npath = aNpath
            }
            else
            {
                data[npc.id].icon = 'mas/nic32x32.gif'
                Engine.npcs.updateData(data)
                fetch(npcIcon)
                    .then(response => response.arrayBuffer())
                    .then(buffer => new Uint8Array(buffer))
                    .then(array => decodeGif(array))
                    .then(decoded =>
                    {
                        const canvas = document.createElement('canvas')
                        canvas.width = decoded.width
                        canvas.height = decoded.height * decoded.frameData.length
                        const ctx = canvas.getContext('2d')

                        const backgroundImg = new ImageData(decoded.frameData[0], decoded.width, decoded.height)
                        ctx.putImageData(backgroundImg, 0, 0)

                        for (let i = 1; i < decoded.frameData.length; i++)
                        {
                            const frameCanvas = document.createElement('canvas')
                            frameCanvas.width = decoded.width
                            frameCanvas.height = decoded.height
                            const frameCtx = frameCanvas.getContext('2d')

                            const img = new ImageData(decoded.frameData[i], decoded.width, decoded.height)
                            frameCtx.putImageData(img, 0, 0)

                            switch (decoded.frameDisposal[i - 1])
                            {
                                case GIF_FRAME_DISPOSAL.NON_SPECIFIED:
                                case GIF_FRAME_DISPOSAL.DO_NOT_DISPOSE:
                                    ctx.drawImage(
                                        canvas,
                                        0, (i - 1) * decoded.height, decoded.width, decoded.height,
                                        0, i * decoded.height, decoded.width, decoded.height
                                    )
                                    break
                                case GIF_FRAME_DISPOSAL.RESTORE_TO_BACKGROUND:
                                    // Apparently most browsers just clear to transparency,
                                    // so we'll do the same for now (so just do nothing here).
                                    // Besides, NPCs in game should have transparent background
                                    break
                                case GIF_FRAME_DISPOSAL.RESTORE_TO_PREVIOUS:
                                    // As per specification, "if decoder is not capable of saving an area of a graphic
                                    // marked as restore To Previous, it is recommended that a decoder restore to
                                    // the background color."
                                    // Due to lack of popularity of this type of disposal and problems with
                                    // implementing a solution (since we're working backwards),
                                    // this disposal will probably remain partially broken
                                    // (besides, main game doesn't even support different frame disposals)
                                    ctx.putImageData(backgroundImg, 0, i * decoded.height)
                            }
                            ctx.drawImage(frameCanvas, 0, i * decoded.height)
                        }

                        // Update everything by hand
                        const createdNpc = Engine.npcs.getById(npc.id)
                        createdNpc.sprite = new Image()
                        createdNpc.sprite.src = canvas.toDataURL()
                        createdNpc.fw = decoded.width
                        createdNpc.fh = decoded.height
                        createdNpc.halffw = decoded.width / 2
                        createdNpc.halffh = decoded.height / 2
                        createdNpc.frameAmount = decoded.frameData.length
                        createdNpc.frames = decoded.frameDelays
                        createdNpc.leftPosMod = data[npc.id].type > 3 && !(createdNpc.fw % 64) ? -16 : 0
                        if (data[npc.id].type !== 4) createdNpc.updateCollider()
                        createdNpc.beforeOnload = function () {} // force not updating image anymore
                    })
                    .catch((err) => console.error(`Error while fetching NPC ${npcIcon}`, err))
            }
        }
        else
        {
            npc.icon = 'mas/nic32x32.gif'
            Engine.npcs.updateData(data)
            npc.icon = npcIcon

            const gameNpc = Engine.npcs.getById(npc.id)
            gameNpc.staticAnimation = true

            const img = new Image()
            img.onload = function ()
            {
                gameNpc.sprite = img

                const oldBeforeOnLoad = gameNpc.beforeOnload
                gameNpc.beforeOnload = function ()
                {
                    return oldBeforeOnLoad({
                        img: npcIcon,
                        frames: 1,
                        hdr: {
                            width: img.width,
                            height: img.height
                        }
                    }, img, npc)
                }
                gameNpc.beforeOnload()
            }
            img.src = npcIcon
        }

        if (npc.dialog) addDialogToDialogList(npc.id, npc.nick, npc.dialog)

        if (!collisionBefore)
        {
            if (npc.collision)
                setCollision(npc.x, npc.y)
            else
                removeCollision(npc.x, npc.y)
        }

        return data
    }
    else
    {
        const $npc = $('<div id="npc' + npc.id + '" class="npc nerthus-npc"></div>')
            .css({
                backgroundImage: 'url(' + npc.icon + ')',
                zIndex: npc.type === 4 ? npc.y * 2 + 11 : npc.y * 2 + 10,
                left: npc.x * 32,
                top: npc.y * 32 - 16,
                pointerEvents: npc.type === 4 ? 'none' : 'auto'
            })

        const img = new Image()
        img.onload = function ()
        {
            const width = img.width
            const height = img.height

            const tmpLeft = npc.x * 32 + 16 - Math.round(width / 2) + ((npc.type > 3 && !(width % 64)) ? -16 : 0)
            const wpos = Math.round(this.x) + Math.round(this.y) * 256
            let wat
            if (map.water && map.water[wpos])
                wat = map.water[wpos] / 4
            $npc.css({
                left: tmpLeft,
                top: npc.y * 32 + 32 - height + (wat > 8 ? 0 : 0),
                width: (tmpLeft + width > map.x * 32 ? map.x * 32 - tmpLeft : width),
                height: height - (wat > 8 ? ((wat - 8) * 4) : 0)
            })
        }
        img.src = npc.icon
        $npc.appendTo('#base')
        if (npc.nick)
            $npc.attr({
                ctip: 't_npc',
                tip: npc.nick
            })

        if (npc.dialog)
        {
            addDialogToDialogList(npc.id, npc.nick, npc.dialog)
            $npc.click(createClickWrapper(npc, openDialog.bind(null, npc.id, 0)))
        }

        if (npc.collision)
            setCollision(npc.x, npc.y)
        return $npc
    }
}

/**
 * Function adds new NPC to the list and displays him,
 * or replaces NPC on the same coordinates and same map
 * @param npc
 * @param mapId
 */
export function addNpcToList(npc, mapId)
{
    if (!customNpcs[mapId]) customNpcs[mapId] = {}
    if (customNpcs[mapId][npc.id]) removeNpc(npc.x, npc.y, mapId)
    customNpcs[mapId][npc.id] = npc
    if (INTERFACE === 'NI')
    {
        if (Engine.map.d.id === mapId)
            addNpc(npc)
    }
    else
    {
        if (map.id === mapId)
            addNpc(npc)
    }
    callEvent('addTemporaryNpc', {npc: npc, mapId: mapId})
}
