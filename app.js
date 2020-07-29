const ipcRenderer = require('electron').ipcRenderer;
const BrowserWindow = require('electron').remote.BrowserWindow;

var openvidu;
var session;
var publisher;
var mySessionId;

var Demo = (function () {
    var _myMediaStream; // My MediaStream instance
    var _audioTrack;
    var _mediaRecorder;
    var _recordedChunks = [];
    async function _init() {
        eventBindingForAudio();
        await startCall();
        
    }


ipcRenderer.on('screen-share-ready', (event, message) => {
    // User has chosen a screen to share. screenId is message parameter
    showSession();
    publisher = openvidu.initPublisher("publisher", {
        videoSource: "screen:" + message
    });
    joinSession();
});

function eventBindingForAudio() {
    $("#btnMuteUnmute").on('click', function () {
        if (!_audioTrack) return;

        if (_audioTrack.enabled == false) {
            _audioTrack.enabled = true;
            $(this).text("Mute");
        }
        else {
            _audioTrack.enabled = false;
            $(this).text("UnMute");
        } 
        console.log(_audioTrack);
    });
    
    $("#btnStartReco").on('click', function () {
        setupMediaRecorder(_myMediaStream);
        _mediaRecorder.start(1000);
    });
    $("#btnPauseReco").on('click', function () {
        _mediaRecorder.pause();
    });
    $("#btnResumeReco").on('click', function () {
        _mediaRecorder.resume();
    });
    $("#btnStopReco").on('click', function () {
        _mediaRecorder.stop();
    });
}

function setupMediaRecorder(stream) {
    _recordedChunks = [];
    _mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    
    _mediaRecorder.ondataavailable = (e) => {
        console.log(e.data.size);
        if(e.data.size > 0)
            _recordedChunks.push(e.data);
    };


    _mediaRecorder.onstart = async () => {
        $("#btnStartReco").hide();
        $("#btnPauseReco").show();
        $("#btnStopReco").show();
        $("#downloadRecording").hide();
    };
    _mediaRecorder.onpause = async () => {
        $("#btnPauseReco").hide();
        $("#btnResumeReco").show();
    };
    _mediaRecorder.onresume = async () => {
        $("#btnResumeReco").hide();
        $("#btnPauseReco").show();
        $("#btnStopReco").show();
    };

    _mediaRecorder.onstop = async () => {
        
        var blob = new Blob(_recordedChunks, { type: 'video/webm' });

        let url = window.URL.createObjectURL(blob);
        //document.getElementById('videoCtr').src = url;

        $("#downloadRecording").attr({ href: url, download: 'test.weba' }).show();

        $("#btnStartReco").show();
        $("#btnPauseReco").hide();
        $("#btnStopReco").hide();
        //var download = document.getElementById('downloadRecording');
        //download.href = url;
        //download.download = 'test.weba';
        //download.style.display = 'block';


    };
}

async function startCall() {
    
    try {
        _myMediaStream = await navigator.mediaDevices.getUserMedia(
            { video: false, audio: true });

    } catch (e) {
        console.log(e);
    }

    document.getElementById('audioCtr').srcObject = _myMediaStream;

    _audioTrack = _myMediaStream.getAudioTracks()[0];

    _audioTrack.onmute = function (e) {
        console.log(e);
    }
    _audioTrack.onunmute = function (e) {
        console.log(e);
    }

    _myMediaStream.getAudioTracks().forEach(track => {
        console.log(track);
    })

}

return {
    init: async function () {
        await _init();
    }
}
}());

function initPublisher() {

    openvidu = new OpenVidu();

    const shareScreen = document.getElementById("screen-sharing").checked;
    if (shareScreen) {
        openScreenShareModal();
    } else {
        publisher = openvidu.initPublisher("publisher");
        joinSession();
    }
}

function joinSession() {

    session = openvidu.initSession();
    session.on("streamCreated", function (event) {
        session.subscribe(event.stream, "subscriber");
    });

    mySessionId = document.getElementById("sessionId").value;

    getToken(mySessionId).then(token => {
        session.connect(token, {clientData: 'OpenVidu Electron'})
            .then(() => {
                showSession();
                session.publish(publisher);
            })
            .catch(error => {
                console.log("There was an error connecting to the session:", error.code, error.message);
            });
    });
}

function leaveSession() {
    session.disconnect();
    hideSession();
}

function showSession() {
    document.getElementById("session-header").innerText = mySessionId;
    document.getElementById("join").style.display = "none";
    document.getElementById("session").style.display = "block";
}

function hideSession() {
    document.getElementById("join").style.display = "block";
    document.getElementById("session").style.display = "none";
}

function openScreenShareModal() {
    let win = new BrowserWindow({
        parent: require('electron').remote.getCurrentWindow(),
        modal: true,
        minimizable: false,
        maximizable: false,
        webPreferences: {
            nodeIntegration: true
        },
        resizable: false
    })
    win.setMenu(null);
    // win.webContents.openDevTools();

    var theUrl = 'file://' + __dirname + '/modal.html'
    win.loadURL(theUrl);
}


/**
 * --------------------------
 * SERVER-SIDE RESPONSIBILITY
 * --------------------------
 * These methods retrieve the mandatory user token from OpenVidu Server.
 * This behavior MUST BE IN YOUR SERVER-SIDE IN PRODUCTION (by using
 * the API REST, openvidu-java-client or openvidu-node-client):
 *   1) Initialize a session in OpenVidu Server	(POST /api/sessions)
 *   2) Generate a token in OpenVidu Server		(POST /api/tokens)
 *   3) The token must be consumed in Session.connect() method
 */

var OPENVIDU_SERVER_URL = "https://localhost:4443";
var OPENVIDU_SERVER_SECRET = "MY_SECRET";

function getToken(mySessionId) {
    return createSession(mySessionId).then(sessionId => createToken(sessionId));
}

function createSession(sessionId) { // See https://docs.openvidu.io/en/stable/reference-docs/REST-API/#post-apisessions
    return new Promise((resolve, reject) => {
        axios.post(
                OPENVIDU_SERVER_URL + "/api/sessions",
                JSON.stringify({
                    customSessionId: sessionId
                }), {
                    headers: {
                        'Authorization': "Basic " + btoa("OPENVIDUAPP:" + OPENVIDU_SERVER_SECRET),
                        'Content-Type': 'application/json',
                    },
                    crossdomain: true
                }
            )
            .then(res => {
                if (res.status === 200) {
                    // SUCCESS response from openvidu-server. Resolve token
                    resolve(res.data.id);
                } else {
                    // ERROR response from openvidu-server. Resolve HTTP status
                    reject(new Error(res.status.toString()));
                }
            }).catch(error => {
                if (error.response.status === 409) {
                    resolve(sessionId);
                    return false;
                } else {
                    console.warn('No connection to OpenVidu Server. This may be a certificate error at ' + OPENVIDU_SERVER_URL);
                    return false;
                }
            });
        return false;
    });
}

function createToken(sessionId) { // See https://docs.openvidu.io/en/stable/reference-docs/REST-API/#post-apitokens
    return new Promise((resolve, reject) => {
        axios.post(
                OPENVIDU_SERVER_URL + "/api/tokens",
                JSON.stringify({
                    session: sessionId
                }), {
                    headers: {
                        'Authorization': "Basic " + btoa("OPENVIDUAPP:" + OPENVIDU_SERVER_SECRET),
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                }
            )
            .then(res => {
                if (res.status === 200) {
                    // SUCCESS response from openvidu-server. Resolve token
                    resolve(res.data.token);
                } else {
                    // ERROR response from openvidu-server. Resolve HTTP status
                    reject(new Error(res.status.toString()));
                }
            }).catch(error => {
                reject(error);
            });
        return false;
    });
}