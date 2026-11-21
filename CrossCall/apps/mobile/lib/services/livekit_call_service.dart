import 'package:livekit_client/livekit_client.dart';

/// LiveKit SFU Calling Service for CrossCall (Android, iOS, Flutter Web).
/// Tokens are requested from the authenticated backend endpoint; API keys never live on client.
class LiveKitCallService {
  Room? _room;

  Room? get room => _room;

  Future<Room> connectToRoom({
    required String livekitUrl,
    required String token,
    required bool enableVideo,
    bool adaptiveStream = true,
    bool dynacast = true,
  }) async {
    final room = Room(
      roomOptions: RoomOptions(
        adaptiveStream: adaptiveStream,
        dynacast: dynacast,
        defaultAudioPublishOptions: const AudioPublishOptions(
          dtx: true,
          noiseSuppression: true,
          echoCancellation: true,
        ),
        defaultVideoPublishOptions: const VideoPublishOptions(
          simulcast: true,
          videoEncoding: VideoEncoding(maxBitrate: 1200000, maxFramerate: 30),
        ),
      ),
    );

    await room.connect(livekitUrl, token);
    await room.localParticipant?.setMicrophoneEnabled(true);
    if (enableVideo) {
      await room.localParticipant?.setCameraEnabled(true);
    }
    _room = room;
    return room;
  }

  Future<void> disconnect() async {
    await _room?.disconnect();
    _room = null;
  }
}
