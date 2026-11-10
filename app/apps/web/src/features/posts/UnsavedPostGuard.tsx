import React, { useContext, useEffect, useRef, type MutableRefObject } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';
function RouterGuard({
  active,
  leaving,
}: {
  active: boolean;
  leaving: MutableRefObject<boolean>;
}): null {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active &&
      !leaving.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('You have unsaved changes. Leave this page and discard them?'))
        blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  return null;
}
export function UnsavedPostGuard({ active }: { active: boolean }): React.JSX.Element | null {
  const router = useContext(UNSAFE_DataRouterContext);
  const leaving = useRef(false);
  useEffect(() => {
    if (!active) return;
    leaving.current = false;
    const signout = (event: Event): void => {
      if (!window.confirm('You have unsaved changes. Sign out and discard them?'))
        event.preventDefault();
      else leaving.current = true;
    };
    window.addEventListener('parisian:before-signout', signout);
    const warn = (event: BeforeUnloadEvent): void => {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('parisian:before-signout', signout);
    };
  }, [active]);
  return router ? <RouterGuard active={active} leaving={leaving} /> : null;
}
