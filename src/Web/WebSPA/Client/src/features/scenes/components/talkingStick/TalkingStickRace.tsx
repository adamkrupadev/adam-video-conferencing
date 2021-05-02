import { Fab } from '@material-ui/core';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import * as coreHub from 'src/core-hub';
import usePermission from 'src/hooks/usePermission';
import { SCENES_CAN_TAKE_TALKING_STICK } from 'src/permissions';
import { RenderSceneProps } from '../../types';
import TalkingStickFrame from './TalkingStickFrame';
import TalkingStickScreen from './TalkingStickScreen';

export default function TalkingStickRace({ className, next }: RenderSceneProps) {
   const overwritten = next();
   if (overwritten) return <TalkingStickFrame className={className}>{overwritten}</TalkingStickFrame>;

   return <NoPresenter className={className} />;
}

type NoPresenterProps = {
   className?: string;
};

function NoPresenter({ className }: NoPresenterProps) {
   const { t } = useTranslation();
   const dispatch = useDispatch();
   const canEnqueue = usePermission(SCENES_CAN_TAKE_TALKING_STICK);

   const handleTake = () => dispatch(coreHub.talkingStickTake());

   return (
      <TalkingStickScreen className={className} mode="race">
         <Fab variant="extended" color="primary" style={{ minWidth: 220 }} disabled={!canEnqueue} onClick={handleTake}>
            {t<string>('conference.scenes.talking_stick_modes.take_stick')}
         </Fab>
      </TalkingStickScreen>
   );
}
