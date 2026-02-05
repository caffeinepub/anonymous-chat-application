import List "mo:core/List";
import Map "mo:core/Map";
import Set "mo:core/Set";
import Time "mo:core/Time";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Array "mo:core/Array";
import Storage "blob-storage/Storage";
import MixinStorage "blob-storage/Mixin";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";
import Runtime "mo:core/Runtime";

actor {
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);
  include MixinStorage();

  type ChatRoom = {
    joinCode : Text;
    createdAt : Time.Time;
  };

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
  let chatContexts = Map.empty<Text, ()>();

  let messages = Map.empty<Text, List.List<Message>>();
  let userProfiles = Map.empty<Text, UserProfile>();

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
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only admins can prune messages");
    };
    let now = Time.now();
    for ((roomId, _context) in chatContexts.entries()) {
      switch (messages.get(roomId)) {
        case (null) {};
        case (?msgList) {
          let validMsgs = msgList.filter(func(msg) { now - msg.timestamp <= messageTTL });
          if (validMsgs.size() != msgList.size()) {
            messages.add(roomId, validMsgs);
          };
        };
      };
    };

    for ((roomId, msgList) in messages.entries()) {
      if (msgList.size() == 0 and not activeRooms.contains(roomId)) {
        messages.remove(roomId);
      };
    };
  };

  func roomIdWasRecentlyCreated(roomId : Text) : Bool {
    let currentTime = Time.now();
    switch (messages.get(roomId)) {
      case (null) { false };
      case (?messageList) {
        messageList.any(func(msg) { currentTime - msg.timestamp < 5_000_000_000 });
      };
    };
  };

  public query func roomExists(roomId : Text) : async Bool {
    let trimmed = roomId.trim(#char ' ');
    chatContexts.containsKey(trimmed) or messages.containsKey(trimmed);
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
    };
  };

  public shared ({ caller }) func createRoom(joinCode : Text) : async Text {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can create rooms");
    };
    let trimmed = joinCode.trim(#char ' ');
    if (trimmed.size() == 0) {
      return "Room join code cannot be empty or whitespace only";
    };

    if (chatContexts.containsKey(trimmed)) {
      return "Room already exists";
    };

    chatContexts.add(trimmed, ());
    trimmed;
  };

  public query ({ caller }) func getMessages(roomId : Text) : async [MessageView] {
    let trimmed = roomId.trim(#char ' ');
    if (trimmed.size() == 0) {
      return [];
    };

    if (not chatContexts.containsKey(trimmed) and not messages.containsKey(trimmed)) {
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
    let trimmedRoomId = roomId.trim(#char ' ');
    if (trimmedRoomId.size() == 0 or not chatContexts.containsKey(trimmedRoomId)) {
      return 0;
    };

    let messageId = nextId();

    let newMessage : Message = {
      id = messageId;
      content;
      timestamp = Time.now();
      nickname;
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
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can edit messages");
    };
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
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can delete messages");
    };
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

  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can view profiles");
    };
    userProfiles.get(caller.toText());
  };

  public query ({ caller }) func getUserProfile(user : Text) : async ?UserProfile {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only admins can view other users' profiles");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };
    userProfiles.add(caller.toText(), profile);
  };
};
