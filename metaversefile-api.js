import * as THREE from 'three';
import React from 'react';
import * as ReactThreeFiber from '@react-three/fiber';
import metaversefile from 'metaversefile';
import {getRenderer, scene, camera, appManager} from './app-object.js';
import {rigManager} from './rig.js';

const localVector2D = new THREE.Vector2();

class PlayerHand {
  constructor() {
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
  }
}
class LocalPlayer {
  constructor() {
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.leftHand = new PlayerHand();
    this.rightHand = new PlayerHand();
    this.hands = [
      this.leftHand,
      this.rightHand,
    ];
  }
}
const localPlayer = new LocalPlayer();
let localPlayerNeedsUpdate = false;
appManager.addEventListener('startframe', e => {
  localPlayerNeedsUpdate = true;
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    // logErrorToMyService(error, errorInfo);
    console.warn(error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children; 
  }
}
function createPointerEvents(store) {
  // const { handlePointer } = createEvents(store)
  const handlePointer = key => e => {
    // const handlers = eventObject.__r3f.handlers;
    // console.log('handle pointer', key, e);
  };
  const names = {
    onClick: 'click',
    onContextMenu: 'contextmenu',
    onDoubleClick: 'dblclick',
    onWheel: 'wheel',
    onPointerDown: 'pointerdown',
    onPointerUp: 'pointerup',
    onPointerLeave: 'pointerleave',
    onPointerMove: 'pointermove',
    onPointerCancel: 'pointercancel',
    onLostPointerCapture: 'lostpointercapture',
  }

  return {
    connected: false,
    handlers: (Object.keys(names).reduce(
      (acc, key) => ({ ...acc, [key]: handlePointer(key) }),
      {},
    )),
    connect: (target) => {
      const { set, events } = store.getState()
      events.disconnect?.()
      set((state) => ({ events: { ...state.events, connected: target } }))
      Object.entries(events?.handlers ?? []).forEach(([name, event]) =>
        target.addEventListener(names[name], event, { passive: true }),
      )
    },
    disconnect: () => {
      const { set, events } = store.getState()
      if (events.connected) {
        Object.entries(events.handlers ?? []).forEach(([name, event]) => {
          if (events && events.connected instanceof HTMLElement) {
            events.connected.removeEventListener(names[name], event)
          }
        })
        set((state) => ({ events: { ...state.events, connected: false } }))
      }
    },
  }
}

let currentAppRender = null;
metaversefile.setApi({
  async import(s) {
    const m = await import(s);
    return m;
  },
  useFrame(fn) {
    const app = currentAppRender;
    if (app) {
      appManager.addEventListener('frame', e => {
        fn(e.data);
      });
      app.addEventListener('destroy', () => {
        appManager.removeEventListener('frame', fn);
      });
    } else {
      throw new Error('useFrame cannot be called outside of render()');
    }
  },
  useLocalPlayer() {
    if (localPlayerNeedsUpdate) {
      if (rigManager.localRig) {
        localPlayer.position.fromArray(rigManager.localRig.inputs.hmd.position);
        localPlayer.quaternion.fromArray(rigManager.localRig.inputs.hmd.quaternion);
        localPlayer.leftHand.position.fromArray(rigManager.localRig.inputs.leftGamepad.position);
        localPlayer.leftHand.quaternion.fromArray(rigManager.localRig.inputs.leftGamepad.quaternion);
        localPlayer.rightHand.position.fromArray(rigManager.localRig.inputs.rightGamepad.position);
        localPlayer.rightHand.quaternion.fromArray(rigManager.localRig.inputs.rightGamepad.quaternion);
      } else {
        localPlayer.position.set(0, 0, 0);
        localPlayer.quaternion.set(0, 0, 0, 1);
        localPlayer.leftHand.position.set(0, 0, 0);
        localPlayer.leftHand.quaternion.set(0, 0, 0, 1);
        localPlayer.rightHand.position.set(0, 0, 0);
        localPlayer.rightHand.quaternion.set(0, 0, 0, 1);
      }
      localPlayerNeedsUpdate = false;
    }
    return localPlayer;
  },
  add(m) {
    const appId = appManager.getNextAppId();
    const app = appManager.createApp(appId);
    currentAppRender = app;

    let renderSpec = null;
    const fn = m.default;
    (() => {
      try {
        if (typeof fn === 'function') {
          renderSpec = fn(metaversefile);
        } else {
          return null;
        }
      } catch(err) {
        console.warn(err);
        return null;
      }
    })();
    currentAppRender = null;

    // console.log('gor react', React, ReactAll);
    if (renderSpec instanceof THREE.Object3D) {
      const o = renderSpec;
      scene.add(o);
      
      app.addEventListener('destroy', () => {
        scene.remove(o);
      });
    } else if (React.isValidElement(renderSpec)) {      
      const o = new THREE.Object3D();
      // o.contentId = contentId;
      o.getPhysicsIds = () => app.physicsIds;
      o.destroy = () => {
        appManager.destroyApp(appId);
        
        (async () => {
          const roots = ReactThreeFiber._roots;
          const root = roots.get(rootDiv);
          const fiber = root?.fiber
          if (fiber) {
            const state = root?.store.getState()
            if (state) state.internal.active = false
            await new Promise((accept, reject) => {
              ReactThreeFiber.reconciler.updateContainer(null, fiber, null, () => {
                if (state) {
                  // setTimeout(() => {
                    state.events.disconnect?.()
                    // state.gl?.renderLists?.dispose?.()
                    // state.gl?.forceContextLoss?.()
                    ReactThreeFiber.dispose(state)
                    roots.delete(canvas)
                    // if (callback) callback(canvas)
                  // }, 500)
                }
                accept();
              });
            });
          }
        })();
      };
      scene.add(o);
      
      const renderer = getRenderer();
      const sizeVector = renderer.getSize(localVector2D);
      const rootDiv = document.createElement('div');
      let rtfScene = null;
      appManager.addEventListener('frame', e => {
        const renderer2 = Object.create(renderer);
        renderer2.render = () => {
          // nothing
          // console.log('elide render');
        };
        renderer2.setSize = () => {
          // nothing
        };
        renderer2.setPixelRatio = () => {
          // nothing
        };
        
        ReactThreeFiber.render(
          React.createElement(ErrorBoundary, {}, [
            React.createElement(fn, {
              // app: appContextObject,
              key: 0,
            }),
          ]),
          rootDiv,
          {
            gl: renderer2,
            camera,
            size: {
              width: sizeVector.x,
              height: sizeVector.y,
            },
            events: createPointerEvents,
            onCreated: state => {
              // state = newState;
              // scene.add(state.scene);
              console.log('got state', state);
              const {scene: newRtfScene} = state;
              if (newRtfScene !== rtfScene) {
                if (rtfScene) {
                  o.remove(rtfScene);
                  rtfScene = null;
                }
                rtfScene = newRtfScene;
                o.add(rtfScene);
              }
            },
            frameloop: 'demand',
          }
        );
      });
      app.addEventListener('destroy', async () => {
        const roots = ReactThreeFiber._roots;
        const root = roots.get(rootDiv);
        const fiber = root?.fiber
        if (fiber) {
          const state = root?.store.getState()
          if (state) state.internal.active = false
          await new Promise((accept, reject) => {
            ReactThreeFiber.reconciler.updateContainer(null, fiber, null, () => {
              if (state) {
                // setTimeout(() => {
                  state.events.disconnect?.()
                  // state.gl?.renderLists?.dispose?.()
                  // state.gl?.forceContextLoss?.()
                  ReactThreeFiber.dispose(state)
                  roots.delete(canvas)
                  // if (callback) callback(canvas)
                // }, 500)
              }
              accept();
            });
          });
        }
      });
      
      return app;
    } else if (renderSpec === null) {
      appManager.destroyApp(appId);
    } else {
      appManager.destroyApp(appId);
      console.warn('unknown renderSpec:', renderSpec);
      throw new Error('unknown renderSpec');
    }
  },
});
window.metaversefile = metaversefile;
[
  './lol.jsx',
  './street/.metaversefile'
].map(async u => {
  const module = await metaversefile.import(u);
  metaversefile.add(module);
});

export default metaversefile;