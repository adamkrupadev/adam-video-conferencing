import { makeStyles, Typography } from '@material-ui/core';
import React from 'react';
import GuestLogin from 'src/features/auth/components/GuestLogin';
import SignInDialog from 'src/features/auth/components/SignInDialog';

const useStyles = makeStyles((theme) => ({
   root: {
      paddingTop: theme.spacing(8),
      marginLeft: theme.spacing(3),
      marginRight: theme.spacing(3),
      [theme.breakpoints.up(400 + theme.spacing(6))]: {
         width: 400,
         marginLeft: 'auto',
         marginRight: 'auto',
      },
   },
   dividerText: {
      marginTop: theme.spacing(2),
      marginBottom: theme.spacing(2),
   },
}));

export default function AuthRoute() {
   const classes = useStyles();

   return (
      <div className={classes.root}>
         <SignInDialog />
         <Typography className={classes.dividerText} align="center">
            OR
         </Typography>
         <GuestLogin />
      </div>
   );
}
