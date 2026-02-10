import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import List "mo:core/List";
import Map "mo:core/Map";
import Set "mo:core/Set";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import Principal "mo:core/Principal";
import Storage "blob-storage/Storage";
import MixinStorage "blob-storage/Mixin";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";
import Migration "migration";

(with migration = Migration.run)
actor {
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);
  include MixinStorage();

  public type Message = {
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
    nonce : ?Text;
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
    nonce : ?Text;
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

  let activeRooms = Set.empty<Text>();
  let messages = Map.empty<Text, List.List<Message>>();
  let userProfiles = Map.empty<Principal, UserProfile>();

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
      nonce = message.nonce;
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

  func validateJoinCode(joinCode : Text) {
    let trimmed = joinCode.trim(#char ' ');
    if (trimmed.size() == 0) {
      Runtime.trap("Room join code cannot be empty");
    };
    if (trimmed.size() > 30) {
      Runtime.trap("Room join code cannot exceed 30 characters");
    };
  };

  public shared ({ caller }) func createRoom(joinCode : Text) : async Text {
    validateJoinCode(joinCode);
    if (activeRooms.contains(joinCode)) {
      Runtime.trap("Room already exists: " # joinCode);
    };
    activeRooms.add(joinCode);
    joinCode;
  };

  public query ({ caller }) func getMessages(roomId : Text) : async [MessageView] {
    validateJoinCode(roomId);
    switch (messages.get(roomId)) {
      case (null) { [] };
      case (?msgs) {
        let filteredMsgs = msgs.filter(isNotExpired);
        filteredMsgs.map<Message, MessageView>(convertMessageToView).toArray();
      };
    };
  };

  public query ({ caller }) func fetchMessagesAfterId(roomId : Text, lastId : Nat) : async [MessageView] {
    validateJoinCode(roomId);
    switch (messages.get(roomId)) {
      case (null) { [] };
      case (?msgs) {
        let filteredMsgs = msgs.filter(
          func(msg) { isNotExpired(msg) and msg.id > lastId }
        );
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
    nonce : Text
  ) : async Nat {
    let validNickname = validateNickname(nickname);
    validateJoinCode(roomId);

    let roomMessages = ensureRoomMessages(roomId);

    let existing = roomMessages.find(
      func(msg) {
        switch (msg.nonce) {
          case (null) { false };
          case (?existingNonce) { existingNonce == nonce };
        };
      }
    );

    switch (existing) {
      case (?duplicate) {
        if (duplicate.owner == userId and duplicate.content == content) {
          return duplicate.id;
        };
      };
      case (null) {};
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
      nonce = ?nonce;
    };

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
    newAudio : ?Storage.ExternalBlob
  ) : async Bool {
    validateJoinCode(roomId);
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
    validateJoinCode(roomId);
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
    emoji : Text
  ) : async Bool {
    validateJoinCode(roomId);
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
    emoji : Text
  ) : async Bool {
    validateJoinCode(roomId);
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

  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };
    userProfiles.add(caller, profile);
  };

  public query ({ caller }) func getMessageTTL() : async Time.Time {
    messageTTL;
  };

  public shared ({ caller }) func pruneExpiredMessages() : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can prune messages");
    };

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
};
