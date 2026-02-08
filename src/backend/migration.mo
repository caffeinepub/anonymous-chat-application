import Map "mo:core/Map";
import List "mo:core/List";
import Set "mo:core/Set";
import Time "mo:core/Time";
import Storage "blob-storage/Storage";

module {
  type OldMessage = {
    id : Nat;
    content : Text;
    timestamp : Time.Time;
    nickname : Text;
    replyToId : ?Nat;
    imageUrl : ?Storage.ExternalBlob;
    videoUrl : ?Storage.ExternalBlob;
    audioUrl : ?Storage.ExternalBlob;
    isEdited : Bool;
    reactions : List.List<{ userId : Text; emoji : Text }>;
    owner : Text;
  };

  type OldUserProfile = {
    nickname : Text;
  };

  type OldActor = {
    messageTTL : Time.Time;
    nextMessageId : Nat;
    activeRooms : Set.Set<Text>;
    messages : Map.Map<Text, List.List<OldMessage>>;
    userProfiles : Map.Map<Text, OldUserProfile>;
  };

  type NewActor = {
    messageTTL : Time.Time;
    nextMessageId : Nat;
    activeRooms : Set.Set<Text>;
    messages : Map.Map<Text, List.List<OldMessage>>;
  };

  public func run(old : OldActor) : NewActor {
    {
      messageTTL = old.messageTTL;
      nextMessageId = old.nextMessageId;
      activeRooms = old.activeRooms;
      messages = old.messages;
    };
  };
};
