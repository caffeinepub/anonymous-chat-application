import List "mo:core/List";
import Map "mo:core/Map";
import Set "mo:core/Set";
import Time "mo:core/Time";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import Storage "blob-storage/Storage";
import MixinStorage "blob-storage/Mixin";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";
import Runtime "mo:core/Runtime";

import Migration "migration";
(with migration = Migration.run)
actor {
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);
  include MixinStorage();

  type Message = {
    id : Nat;
    content : Text;
    timestamp : Time.Time;
    nickname : Text;
    replyToId : ?Nat;
    imageUrl : ?Storage.ExternalBlob;
    videoUrl : ?Storage.ExternalBlob;
    audioUrl : ?Storage.ExternalBlob;
    isEdited : Bool;
    reactions : List.List<Reaction>;
    owner : Text;
  };

  public type MessageView = {
    id : Nat;
    content : Text;
    timestamp : Time.Time;
    nickname : Text;
    replyToId : ?Nat;
    imageUrl : ?Storage.ExternalBlob;
    videoUrl : ?Storage.ExternalBlob;
    audioUrl : ?Storage.ExternalBlob;
    isEdited : Bool;
    reactions : [Reaction];
    owner : Text;
  };

  public type Reaction = {
    userId : Text;
    emoji : Text;
  };

  public type UserProfile = {
    nickname : Text;
  };

  let messageTTL : Time.Time = 24 * 60 * 60 * 1_000_000_000;
  var nextMessageId : Nat = 0;

  // Persistent set of active room codes
  let activeRooms = Set.empty<Text>();
  let messages = Map.empty<Text, List.List<Message>>();

  func ensureRoomMessages(roomId : Text) : List.List<Message> {
    switch (messages.get(roomId)) {
      case (null) {
        let emptyList = List.empty<Message>();
        messages.add(roomId, emptyList);
        emptyList;
      };
      case (?msgs) { msgs };
    };
  };

  func nextId() : Nat {
    let id = nextMessageId;
    nextMessageId += 1;
    id;
  };

  public shared ({ caller }) func pruneExpiredMessages() : async () {
    let now = Time.now();
    for ((roomId, msgList) in messages.entries()) {
      let validMsgs = msgList.filter(func(msg) { now - msg.timestamp <= messageTTL });
      if (validMsgs.size() != msgList.size()) {
        messages.add(roomId, validMsgs);
      };
    };

    for ((roomId, msgList) in messages.entries()) {
      if (msgList.size() == 0 and not activeRooms.contains(roomId)) {
        messages.remove(roomId);
      };
    };
  };

  public query ({ caller }) func roomExists(roomId : Text) : async Bool {
    let trimmed = roomId.trim(#char ' ');
    trimmed.size() > 0 and activeRooms.contains(trimmed);
  };

  func isNotExpired(message : Message) : Bool {
    let currentTime = Time.now();
    (currentTime - message.timestamp) <= messageTTL;
  };

  func convertMessageToView(message : Message) : MessageView {
    {
      id = message.id;
      content = message.content;
      timestamp = message.timestamp;
      nickname = message.nickname;
      replyToId = message.replyToId;
      imageUrl = message.imageUrl;
      videoUrl = message.videoUrl;
      audioUrl = message.audioUrl;
      isEdited = message.isEdited;
      reactions = message.reactions.toArray();
      owner = message.owner;
    };
  };

  func validateNickname(input : Text) : Text {
    let trimmed = input.trim(#char ' ');
    if (trimmed.size() == 0) {
      Runtime.trap("Nickname cannot be empty");
    };
    if (trimmed.size() > 20) {
      Runtime.trap("Nickname cannot exceed 20 characters");
    };
    trimmed;
  };

  public shared ({ caller }) func createRoom(joinCode : Text) : async Text {
    let trimmed = joinCode.trim(#char ' ');
    if (trimmed.size() == 0) {
      Runtime.trap("Room join code cannot be empty or whitespace only");
    };
    if (trimmed.size() > 30) {
      Runtime.trap("Room join code cannot exceed 30 characters");
    };

    if (activeRooms.contains(trimmed)) {
      Runtime.trap("Room already exists");
    };

    activeRooms.add(trimmed);
    trimmed;
  };

  public query ({ caller }) func getMessages(roomId : Text) : async [MessageView] {
    let trimmed = roomId.trim(#char ' ');
    if (trimmed.size() == 0 or not activeRooms.contains(trimmed)) {
      return [];
    };

    switch (messages.get(trimmed)) {
      case (null) { [] };
      case (?msgs) {
        let filteredMsgs = msgs.filter(isNotExpired);
        filteredMsgs.map<Message, MessageView>(convertMessageToView).toArray();
      };
    };
  };

  public shared ({ caller }) func sendMessage(
    roomId : Text,
    content : Text,
    nickname : Text,
    userId : Text,
    replyToId : ?Nat,
    image : ?Storage.ExternalBlob,
    video : ?Storage.ExternalBlob,
    audio : ?Storage.ExternalBlob,
  ) : async Nat {
    let validNickname = validateNickname(nickname);

    let trimmedRoomId = roomId.trim(#char ' ');
    if (trimmedRoomId.size() == 0 or not activeRooms.contains(trimmedRoomId)) {
      Runtime.trap("Cannot send message: Room does not exist");
    };

    let messageId = nextId();

    let newMessage : Message = {
      id = messageId;
      content;
      timestamp = Time.now();
      nickname = validNickname;
      replyToId;
      imageUrl = image;
      videoUrl = video;
      audioUrl = audio;
      isEdited = false;
      reactions = List.empty<Reaction>();
      owner = userId;
    };

    let roomMessages = ensureRoomMessages(trimmedRoomId);
    roomMessages.add(newMessage);

    messageId;
  };

  public shared ({ caller }) func editMessage(
    roomId : Text,
    messageId : Nat,
    userId : Text,
    newContent : Text,
    newImage : ?Storage.ExternalBlob,
    newVideo : ?Storage.ExternalBlob,
    newAudio : ?Storage.ExternalBlob,
  ) : async Bool {
    switch (messages.get(roomId)) {
      case (null) { false };
      case (?msgs) {
        switch (msgs.find(func(msg) { msg.id == messageId })) {
          case (null) { false };
          case (?targetMsg) {
            if (targetMsg.owner != userId) {
              return false;
            };

            let updatedMessages = msgs.map<Message, Message>(
              func(msg) {
                if (msg.id == messageId) {
                  {
                    msg with
                    content = newContent;
                    isEdited = true;
                    imageUrl = newImage;
                    videoUrl = newVideo;
                    audioUrl = newAudio;
                  };
                } else {
                  msg;
                };
              }
            );
            messages.add(roomId, updatedMessages);
            true;
          };
        };
      };
    };
  };

  public shared ({ caller }) func deleteMessage(roomId : Text, messageId : Nat, userId : Text) : async Bool {
    switch (messages.get(roomId)) {
      case (null) { false };
      case (?msgs) {
        switch (msgs.find(func(msg) { msg.id == messageId })) {
          case (null) { false };
          case (?targetMsg) {
            if (targetMsg.owner != userId) {
              return false;
            };

            let filteredMessages = msgs.filter(
              func(msg) { msg.id != messageId }
            );
            messages.add(roomId, filteredMessages);
            true;
          };
        };
      };
    };
  };

  public shared ({ caller }) func addReaction(
    roomId : Text,
    messageId : Nat,
    userId : Text,
    emoji : Text,
  ) : async Bool {
    switch (messages.get(roomId)) {
      case (null) { false };
      case (?msgs) {
        let updatedMessages = msgs.map<Message, Message>(
          func(msg) {
            if (msg.id == messageId) {
              let newReaction : Reaction = {
                userId;
                emoji;
              };
              msg.reactions.add(newReaction);
              msg;
            } else {
              msg;
            };
          }
        );
        messages.add(roomId, updatedMessages);
        true;
      };
    };
  };

  public shared ({ caller }) func removeReaction(
    roomId : Text,
    messageId : Nat,
    userId : Text,
    emoji : Text,
  ) : async Bool {
    switch (messages.get(roomId)) {
      case (null) { false };
      case (?msgs) {
        let updatedMessages = msgs.map<Message, Message>(
          func(msg) {
            if (msg.id == messageId) {
              let filteredReactions = msg.reactions.filter(
                func(reaction) {
                  not (reaction.userId == userId and reaction.emoji == emoji);
                }
              );
              { msg with reactions = filteredReactions };
            } else {
              msg;
            };
          }
        );
        messages.add(roomId, updatedMessages);
        true;
      };
    };
  };

  public query ({ caller }) func getMessageTTL() : async Time.Time {
    messageTTL;
  };
};
