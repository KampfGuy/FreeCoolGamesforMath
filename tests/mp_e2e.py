import asyncio, json, sys
from playwright.async_api import async_playwright
URL='http://localhost:8765/index.html'
D='/workspace/FreeCoolGamesforMath/docs/'
res={}
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--use-fake-ui-for-media-stream','--no-sandbox'])
    import os
    FAKE=os.environ.get('FAKE')=='1'
    if FAKE:
      ctx=await b.new_context(viewport={'width':1280,'height':800}); await ctx.add_init_script(path='/workspace/FreeCoolGamesforMath/tests/fake-peer-shim.js'); A=await ctx.new_page(); B=await ctx.new_page()
    else:
      A=await (await b.new_context(viewport={'width':1280,'height':800})).new_page(); B=await (await b.new_context(viewport={'width':1280,'height':800})).new_page()
    res['transport']='fake BroadcastChannel shim' if FAKE else 'real PeerJS'
    logs=[]
    for n,pg in (('A',A),('B',B)): pg.on('console', lambda m,n=n: logs.append(f'{n}: {m.text}')); pg.on('pageerror', lambda e,n=n: logs.append(f'{n} ERR: {e}'))
    for pg in (A,B): await pg.goto(URL); await pg.wait_for_timeout(800)
    res['version']=await A.evaluate('__fcgm.VERSION')
    await A.screenshot(path=D+'mp-menu.png')
    await A.click('#b-mp'); await A.fill('#mp-name','Kampf'); await A.click('#mp-colors button[data-c="#ff8a3d"]')
    await A.click('#mp-host')
    await A.wait_for_function('__fcgm.mp.active', timeout=25000)
    code=await A.evaluate('__fcgm.mp.code'); res['code']=code
    await B.click('#b-mp'); await B.fill('#mp-name','Luna'); await B.click('#mp-colors button[data-c="#4dd0ff"]')
    await B.fill('#mp-code', code.lower()); await B.click('#mp-join')
    await B.wait_for_function('__fcgm.mp.active', timeout=30000)
    await A.wait_for_function('__fcgm.mp.count===2', timeout=15000)
    res['hostCount']=await A.evaluate('__fcgm.mp.count'); res['joinCount']=await B.evaluate('__fcgm.mp.count')
    await B.fill('#mp-chat-in','hi Kampf, shit this is cool'); await B.press('#mp-chat-in','Enter')
    await A.fill('#mp-chat-in','Welcome aboard! Race you to orbit.'); await A.wait_for_timeout(800); await A.press('#mp-chat-in','Enter')
    await A.wait_for_timeout(4500)
    res['chatA']=await A.evaluate('__fcgm.mp.chat.map(m=>m.from+": "+m.text)')
    await A.screenshot(path=D+'mp-lobby.png'); await B.screenshot(path=D+'mp-lobby-join.png')
    # both fly free flight with the orbiter
    for pg in (A,B):
      await pg.evaluate('''()=>{const m=__fcgm.MISSIONS.find(x=>x.id==='free');__fcgm.openHangar(m);__fcgm.builder.setStack(__fcgm.EX_HEAVY);__fcgm.launch();}''')
    await A.wait_for_timeout(500)
    await A.evaluate('__fcgm.teleport({alt:40000, angle:Math.PI/2, circular:true, heading:Math.PI})')
    await A.wait_for_timeout(1000)
    await B.evaluate('''()=>{const mp=__fcgm.mp,f=__fcgm.flight;const p=mp.flyingRemotes()[0];const r=mp.predictSnap(p.snap,f.body,f.world.t);__fcgm.teleport({alt:40000, angle:Math.atan2(r.y,r.x)-0.00005, circular:true, heading:Math.PI*0.93});}''')
    await A.wait_for_timeout(2500)
    res['A_sees']=await A.evaluate('__fcgm.mp.flyingRemotes().map(p=>({n:p.name,b:p.snap.b,alt:Math.round(Math.hypot(p.snap.px,p.snap.py)-300000),parts:(p.parts||[]).length}))')
    res['B_sees']=await B.evaluate('__fcgm.mp.flyingRemotes().map(p=>({n:p.name,b:p.snap.b,alt:Math.round(Math.hypot(p.snap.px,p.snap.py)-300000),parts:(p.parts||[]).length}))')
    res['tA_tB']=[await A.evaluate('__fcgm.world.t'), await B.evaluate('__fcgm.world.t')]
    await A.evaluate('__fcgm.view.zoom=2.2'); await A.wait_for_timeout(400)
    await A.screenshot(path=D+'mp-flight-two-players.png')
    await B.evaluate('__fcgm.view.zoom=2.2'); await B.wait_for_timeout(300); await B.screenshot(path=D+'mp-flight-joiner-view.png')
    # move B farther so map shows separation
    await B.evaluate('__fcgm.teleport({alt:120000, angle:Math.PI/2+1.2, circular:true})'); await A.wait_for_timeout(1500)
    await A.keyboard.press('KeyM'); await A.wait_for_timeout(800); await A.screenshot(path=D+'mp-map-both.png'); await A.keyboard.press('KeyM')
    # warp: client asks (refused), host asks
    await B.keyboard.press('Period'); await A.keyboard.press('Period'); await A.keyboard.press('Period'); await A.keyboard.press('Period')
    await A.wait_for_timeout(3000)
    res['warp']=[await A.evaluate('__fcgm.flight.warpIdx'), await B.evaluate('__fcgm.flight.warpIdx')]
    res['tA_tB_warp']=[await A.evaluate('__fcgm.world.t'), await B.evaluate('__fcgm.world.t')]
    await A.evaluate('__fcgm.mp.setWarp(0)'); await A.wait_for_timeout(500)
    # chat in flight
    await B.keyboard.press('Enter'); await B.keyboard.type('see you in orbit!'); await B.keyboard.press('Enter')
    await A.wait_for_timeout(1200); await A.evaluate('__fcgm.view.zoom=1'); await A.screenshot(path=D+'mp-chat-in-flight.png')
    # race
    await A.evaluate('__fcgm.mp.startRace("space")'); await A.wait_for_timeout(1500)
    res['raceB']=await B.evaluate('[__fcgm.mp.race && __fcgm.mp.race.mission, document.querySelector(".screen.active").id]')
    for pg in (A,B): await pg.evaluate('''()=>{__fcgm.builder.setStack(__fcgm.EX_HEAVY);__fcgm.launch();}''')
    await B.evaluate('__fcgm.teleport({alt:31000, circular:true})'); await B.wait_for_timeout(1200)
    await A.evaluate('__fcgm.teleport({alt:32000, circular:true})'); await A.wait_for_timeout(1500)
    res['results']=await A.evaluate('__fcgm.mp.race.results.map(r=>r.name+" "+r.time.toFixed(1))')
    await A.evaluate('__fcgm.show("mp")'); await A.wait_for_timeout(500); await A.screenshot(path=D+'mp-race-results.png')
    # disconnect / rejoin
    await B.evaluate('__fcgm.mp.leave()'); await A.wait_for_timeout(2000)
    res['afterLeave']=await A.evaluate('__fcgm.mp.count')
    await B.evaluate('__fcgm.show("mp")'); await B.click('#mp-join'); await B.wait_for_function('__fcgm.mp.active', timeout=30000); await A.wait_for_timeout(1500)
    res['afterRejoin']=await A.evaluate('__fcgm.mp.list.map(p=>p.name)')
    await B.close(); await A.wait_for_timeout(12500)
    res['afterClose']=await A.evaluate('__fcgm.mp.count')
    print(json.dumps(res,indent=1)); print('\n'.join(l for l in logs if 'ERR' in l or 'rror' in l)[:3000])
    await b.close()
asyncio.run(main())
