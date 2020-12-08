import JitsiMeetButton from "./components/JitsiMeetButton.vue";
import CallPopup from "./components/CallPopup.vue";

Vue.use(Vuetify);
Vue.component("jitsi-meet-button", JitsiMeetButton);
const vuetify = new Vuetify({
  dark: true,
  iconfont: "",
});

// getting language of user
const lang = (eXo && eXo.env && eXo.env.portal && eXo.env.portal.language) || "en";
const localePortlet = "locale.jitsi";
const resourceBundleName = "Jitsi";
const url = `${eXo.env.portal.context}/${eXo.env.portal.rest}/i18n/bundle/${localePortlet}.${resourceBundleName}-${lang}.json`;
const callStates = new Map();
const callPopups = new Map();

export function init(settings) {
  // getting locale ressources
  return exoi18n.loadLanguageAsync(lang, url).then((i18n) => {
    // init Vue app when locale ressources are ready
    return new Vue({
      data() {
        return {
          callSettings: settings
        };
      },
      created() {
        if(!callStates.has(this.callSettings.callId)) {
          callStates.set(this.callSettings.callId, new Map());
        }
        // different buttons for the same call states
        const statesForTheSameCall = callStates.get(this.callSettings.callId);
        statesForTheSameCall.set(this.callSettings.context.parentClasses, {
          setCallState: this.setCallState,
          getCallState: this.getCallState
        });
      },
      methods: {
        setCallState: function(callState) {
          this.$set(this.callSettings, "callState", callState);
        },
        getCallState: function() {
          return this.callSettings.callState;
        }
      },
      render: (h) =>
        h(JitsiMeetButton, {
          props: {
            callSettings: settings,
            i18n: i18n,
            language: lang,
            resourceBundleName: resourceBundleName,
          }
        }),
      i18n,
      vuetify,
    });
  });
}

export function updateCallState(callId, state) {
  const buttonStates = callStates.get(callId);
  if (buttonStates) {
    buttonStates.forEach((stateHandler) => {
      stateHandler.setCallState(state);
    });
  }
}

export function initCallPopup(
    callId,
    callerId,
    callerLink,
    callerAvatar,
    callerMessage,
    playRingtone) {
      
  const log = webConferencing.getLog("jitsi");
  const currentUserId = webConferencing.getUser().id;
      
  // Ring ID should be unique per a Platform instance
  const ringId = `jitsi-call-ring-${window.location.host}-${callerId}`;
  if (playRingtone) {
    // TODO We need play a single ringtone per page - it will play for at least one incoming call
    const callRinging = localStorage.getItem(ringId);
    if (!callRinging || Date.now() - callRinging > 5000) {
      log.trace(`>>> Call start ringing: ${  callId  } for ${  currentUserId}`);
      // if not rnging or ring flag too old (for cases of crashed browser page w/o work in process.always below)
      localStorage.setItem(
        ringId,
        Date.now()
      ); // set it quick as possible to avoid race conditions
    } else {
      playRingtone = false;
      log.trace(`>>> Call already ringing: ${  callId  } for ${  currentUserId}`);
    }
  }
  
  return exoi18n.loadLanguageAsync(lang, url).then((i18n) => {
    const container = document.createElement("div");
    container.setAttribute("class", "call-popup"); // TODO why we need an ID unique per page?
    let onAccepted;
    let onRejected;
    let autoRejectId;
    const comp = new Vue({
      el: container,
      components: {
        CallPopup
      },
      data() {
        return {
          isDialogVisible: true,
          callerId: callerId,
          avatar: callerAvatar,
          callerMessage: callerMessage,
          playRingtone: playRingtone
        };
      },
      mounted() {
        autoRejectId = setTimeout(() => {
          log.info(`Auto rejected the call: ${  callId  } user: ${  currentUserId}`);
          doReject();
        }, 60000); // Reject automatically calls in 60 seconds if the user hasn't answered
      },
      i18n,
      vuetify,
      render: function(h) {
        return h(CallPopup, {
          props: {
            isDialogVisible: this.isDialogVisible,
            caller: this.callerId,
            avatar: this.avatar,
            callerMessage: this.callerMessage,
            playRingtone: this.playRingtone,
            i18n
          },
          on: {
            accepted: doAccept,
            rejected: doReject
          }
        });
      }
    });
    
    function doAccept() {
      closeCallPopup(callId);
      if (playRingtone) {
        localStorage.removeItem(ringId);
      }
      if (onAccepted) {
        onAccepted();
      }
    }
    
    function doReject(isClosed) {
      closeCallPopup(callId);
      if (playRingtone) {
        localStorage.removeItem(ringId);
      }
      if (onRejected) {
        onRejected(isClosed);
      }
    }
    
    const popup = {
      callId,
      callerId,
      close: function() {
        clearTimeout(autoRejectId); // Clear autoreject for the call
        comp.isDialogVisible = false;
        comp.$destroy();
      },
      onAccepted: function(callback) {
        onAccepted = callback;
      },
      onRejected: function(callback) {
        onRejected = callback;
      }
    };
    callPopups.set(callId, popup);
    return popup;
  });
}

export function closeCallPopup(callId) {
  const popup = callPopups.get(callId);
  if (popup) {
    callPopups.delete(callId);
    popup.close();
  }
}
