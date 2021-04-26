import {
   Button,
   ButtonBase,
   ClickAwayListener,
   Grow,
   List,
   makeStyles,
   MenuList,
   Paper,
   Popper,
   Typography,
} from '@material-ui/core';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import _ from 'lodash';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import * as coreHub from 'src/core-hub';
import usePermission from 'src/hooks/usePermission';
import { SCENES_CAN_OVERWRITE_CONTENT_SCENE, SCENES_CAN_SET_SCENE } from 'src/permissions';
import { RootState } from 'src/store';
import scenePresenters from '../scene-presenter-registry';
import { Scene } from '../types';
import SceneManagementModeSelectionDialog from './SceneManagementModeSelectionDialog';

const sceneDisplayOrder: Scene['type'][] = ['autonomous', 'grid', 'activeSpeaker', 'screenShare', 'breakoutRoom'];

const useStyles = makeStyles((theme) => ({
   root: {
      padding: theme.spacing(1, 2),
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
   },
   modeButton: {
      padding: theme.spacing(1, 1, 1, 2),
      width: '100%',
      textAlign: 'left',
   },
}));

export default function SceneManagement() {
   const dispatch = useDispatch();
   const classes = useStyles();
   const { t } = useTranslation();

   const [actionPopper, setActionPopper] = useState(false);
   const actionButton = useRef<HTMLButtonElement>(null);
   const handleClose = () => setActionPopper(false);
   const handleOpen = () => setActionPopper(true);

   const [modeSelectionOpen, setModeSelectionOpen] = useState(false);
   const handleOpenModeSelection = () => setModeSelectionOpen(true);
   const handleCloseModeSelection = () => setModeSelectionOpen(false);

   const canSetScene = usePermission(SCENES_CAN_SET_SCENE);
   const canOverwriteScene = usePermission(SCENES_CAN_OVERWRITE_CONTENT_SCENE);

   const synchronized = useSelector((state: RootState) => state.scenes.synchronized);
   if (synchronized === null) return null;

   const { availableScenes, sceneStack, selectedScene, overwrittenContent } = synchronized;

   const handleChangeScene = (scene: Scene) => {
      if (canSetScene) {
         dispatch(coreHub.setScene(scene));
         setModeSelectionOpen(false);
      }
   };

   const availableScenePresenters = _.orderBy(
      availableScenes.map((scene) => {
         // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
         const presenter = scenePresenters.find((x) => x.type === scene.type)!;
         if (!presenter) console.error('Presenter not found', scene);

         return {
            scene,
            presenter,
         };
      }),
      (x) => sceneDisplayOrder.indexOf(x.scene.type),
   );

   return (
      <div>
         <List dense disablePadding>
            <li style={{ paddingLeft: 16, marginTop: 16 }}>
               <Typography variant="subtitle2" color="textSecondary">
                  {t('glossary:scene_plural')}
               </Typography>
            </li>
            <ButtonBase className={classes.modeButton} onClick={handleOpenModeSelection}>
               <Typography variant="body2">Mode: {selectedScene?.type}</Typography>
            </ButtonBase>
            {availableScenePresenters.map(
               ({ presenter, scene }) =>
                  presenter.AvailableSceneListItem && (
                     <presenter.AvailableSceneListItem
                        key={presenter.getSceneId ? presenter.getSceneId(scene) : scene.type}
                        scene={scene}
                        stack={sceneStack}
                        onChangeScene={handleChangeScene}
                     />
                  ),
            )}
         </List>
         <Paper elevation={4} className={classes.root}>
            <Button
               variant="contained"
               color="primary"
               size="small"
               fullWidth
               ref={actionButton}
               onClick={handleOpen}
               aria-controls={actionPopper ? 'scene-action-list' : undefined}
               aria-expanded={actionPopper ? 'true' : undefined}
               aria-label={t('conference.scenes.actions_description')}
               aria-haspopup="menu"
            >
               {t('conference.scenes.actions')} <ArrowDropDownIcon />
            </Button>
         </Paper>
         <Popper open={actionPopper} anchorEl={actionButton.current} role={undefined} transition>
            {({ TransitionProps }) => (
               <Grow
                  {...TransitionProps}
                  style={{
                     transformOrigin: 'center bottom',
                  }}
               >
                  <Paper>
                     <ClickAwayListener onClickAway={handleClose}>
                        <MenuList id="scene-action-list">
                           {scenePresenters.map(({ type, ActionListItem }) => {
                              if (!ActionListItem) return null;
                              return <ActionListItem key={type} onClose={handleClose} />;
                           })}
                        </MenuList>
                     </ClickAwayListener>
                  </Paper>
               </Grow>
            )}
         </Popper>
         {scenePresenters.map(({ AlwaysRender, type }) => AlwaysRender && <AlwaysRender key={type} />)}
         <SceneManagementModeSelectionDialog
            open={modeSelectionOpen}
            onClose={handleCloseModeSelection}
            availableScenes={availableScenes}
            selectedScene={selectedScene}
            onChangeScene={handleChangeScene}
         />
      </div>
   );
}
