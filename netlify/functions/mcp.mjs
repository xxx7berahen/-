const COOKIE = process.env.NETEASE_COOKIE || "";

function csrfToken() {
  const match = COOKIE.match(/(?:^|;\s*)__csrf=([^;]*)/);
  return match ? match[1] : "";
}

async function neteaseRequest(url, data = null) {
  const headers = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://music.163.com/",
    "Cookie": COOKIE,
  };

  let body = undefined;

  if (data !== null) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";

    if (typeof data === "string") {
      body = data;
    } else {
      body = new URLSearchParams(data).toString();
    }
  } else {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      return {
        code: -1,
        error: text,
      };
    }
  } catch (error) {
    return {
      code: -1,
      error: String(error),
    };
  }
}

async function neteaseGet(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://music.163.com/",
        "Cookie": COOKIE,
      },
    });

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      return {
        code: -1,
        error: text,
      };
    }
  } catch (error) {
    return {
      code: -1,
      error: String(error),
    };
  }
}

async function getUid() {
  const resp = await neteaseGet(
    "https://music.163.com/api/nuser/account/get"
  );

  return (
    resp?.profile?.userId ||
    resp?.account?.id ||
    null
  );
}

async function playMusic(query, note = "") {
  const url =
    "https://music.163.com/api/search/get?s=" +
    encodeURIComponent(query) +
    "&type=1&limit=5";

  const resp = await neteaseGet(url);

  const songs = resp?.result?.songs || [];

  if (!songs.length) {
    return `No results for '${query}'`;
  }

  const song = songs[0];
  const songId = song.id;

  let picUrl = "";

  try {
    const detail = await neteaseGet(
      "https://music.163.com/api/song/detail?ids=[" +
        songId +
        "]"
    );

    picUrl =
      detail?.songs?.[0]?.album?.picUrl || "";
  } catch {}

  const name = String(song.name || "").replaceAll(":", "：");

  const artist = (song.artists || [])
    .map((a) => a.name || "")
    .join(", ")
    .replaceAll(":", "：");

  const link =
    "https://music.163.com/song?id=" + songId;

  return (
    `[music:${songId}:${name}:${artist}:${picUrl}]` +
    (note || "") +
    "\n" +
    link
  );
}

async function updatePlaylistDescription(
  playlistId,
  description
) {
  const csrf = csrfToken();

  const url =
    "https://music.163.com/api/playlist/desc/update?csrf_token=" +
    encodeURIComponent(csrf);

  const resp = await neteaseRequest(url, {
    id: String(playlistId),
    desc: description,
  });

  if (resp?.code === 200) {
    return `Updated description for playlist ${playlistId}`;
  }

  const url2 =
    "https://music.163.com/api/playlist/update?csrf_token=" +
    encodeURIComponent(csrf);

  const resp2 = await neteaseRequest(url2, {
    id: String(playlistId),
    desc: description,
    "/api/playlist/update": "",
  });

  if (resp2?.code === 200) {
    return `Updated description for playlist ${playlistId} (via update)`;
  }

  return (
    "Failed: " +
    (resp?.message || resp?.error || "unknown") +
    " | " +
    (resp2?.message || resp2?.error || "unknown")
  );
}

async function createPlaylist(
  name,
  description = "",
  privacy = 0
) {
  const csrf = csrfToken();

  const url =
    "https://music.163.com/api/playlist/create?csrf_token=" +
    encodeURIComponent(csrf);

  const resp = await neteaseRequest(url, {
    name,
    privacy: String(privacy),
    type: "NORMAL",
  });

  if (resp?.code === 200) {
    const playlist = resp?.playlist || {};
    const playlistId = playlist.id;

    let result =
      `Created playlist '${name}' (ID: ${playlistId})`;

    if (description && playlistId) {
      const descResult =
        await updatePlaylistDescription(
          playlistId,
          description
        );

      result += " | Description: " + descResult;
    }

    return result;
  }

  return (
    "Failed: " +
    (resp?.message || resp?.error || "unknown")
  );
}

async function addToPlaylist(
  playlistId,
  songIds
) {
  const csrf = csrfToken();

  const ids = String(songIds)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const url =
    "https://music.163.com/api/playlist/manipulate/tracks?csrf_token=" +
    encodeURIComponent(csrf);

  const resp = await neteaseRequest(url, {
    op: "add",
    pid: String(playlistId),
    trackIds: JSON.stringify(
      ids.map((id) => Number(id))
    ),
  });

  if (resp?.code === 200) {
    return (
      `Added ${ids.length} song(s) to playlist ${playlistId}`
    );
  }

  if (resp?.code === 502) {
    return "Song already in playlist";
  }

  return (
    "Failed: " +
    (resp?.message || resp?.error || "unknown")
  );
}

async function removeFromPlaylist(
  playlistId,
  songIds
) {
  const csrf = csrfToken();

  const ids = String(songIds)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const url =
    "https://music.163.com/api/playlist/manipulate/tracks?csrf_token=" +
    encodeURIComponent(csrf);

  const resp = await neteaseRequest(url, {
    op: "del",
    pid: String(playlistId),
    trackIds: JSON.stringify(
      ids.map((id) => Number(id))
    ),
  });

  if (resp?.code === 200) {
    return (
      `Removed ${ids.length} song(s) from playlist ${playlistId}`
    );
  }

  return (
    "Failed: " +
    (resp?.message || resp?.error || "unknown")
  );
}

async function listMyPlaylists() {
  const uid = await getUid();

  if (!uid) {
    return "Failed to get user ID. Cookie may be expired.";
  }

  const url =
    "https://music.163.com/api/user/playlist?uid=" +
    uid +
    "&limit=50&offset=0";

  const resp = await neteaseGet(url);

  const playlists = resp?.playlist || [];

  if (!playlists.length) {
    return "No playlists found";
  }

  return playlists
    .map((playlist) => {
      const own =
        playlist?.creator?.userId === uid
          ? "(mine)"
          : "(collected)";

      return (
        "ID:" +
        playlist.id +
        " | " +
        playlist.name +
        " | " +
        (playlist.trackCount || 0) +
        " songs " +
        own
      );
    })
    .join("\n");
}

async function getPlaylistSongs(playlistId) {
  const url =
    "https://music.163.com/api/v6/playlist/detail?id=" +
    playlistId;

  const resp = await neteaseGet(url);

  const playlist = resp?.playlist || {};

  let tracks = playlist?.tracks || [];

  if (!tracks.length) {
    const trackIds = playlist?.trackIds || [];

    if (trackIds.length) {
      const ids = trackIds
        .slice(0, 50)
        .map((x) => x.id);

      const detail = await neteaseGet(
        "https://music.163.com/api/song/detail?ids=" +
          JSON.stringify(ids)
      );

      tracks = detail?.songs || [];
    }
  }

  if (!tracks.length) {
    return `Playlist ${playlistId} is empty`;
  }

  const lines = [
    `Playlist: ${playlist.name || ""} (${tracks.length} songs)`,
  ];

  tracks.slice(0, 50).forEach((track, index) => {
    const artist = (
      track.ar ||
      track.artists ||
      []
    )
      .map((a) => a.name || "")
      .join(", ");

    lines.push(
      `${index + 1}. ${track.name || ""} - ${artist} (ID:${track.id || ""})`
    );
  });

  return lines.join("\n");
}

async function getPlayHistory(
  limit = 30,
  allTime = false
) {
  const uid = await getUid();

  if (!uid) {
    return "Failed to get user ID.";
  }

  const recordType = allTime ? "0" : "1";

  const url =
    "https://music.163.com/api/v1/play/record?uid=" +
    uid +
    "&type=" +
    recordType +
    "&limit=" +
    limit;

  const resp = await neteaseGet(url);

  const records =
    resp?.weekData ||
    resp?.allData ||
    [];

  if (!records.length) {
    return "No play history found";
  }

  const lines = ["Recent play history:"];

  records.slice(0, limit).forEach((record, index) => {
    const song = record.song || {};

    const artist = (
      song.ar ||
      song.artists ||
      []
    )
      .map((a) => a.name || "")
      .join(", ");

    const playCount =
      record.playCount ??
      record.score ??
      "";

    lines.push(
      `${index + 1}. ${song.name || ""} - ${artist} (plays:${playCount}, ID:${song.id || ""})`
    );
  });

  return lines.join("\n");
}

async function likeSong(
  songId,
  like = true
) {
  const csrf = csrfToken();

  const action = like ? "true" : "false";

  const url =
    "https://music.163.com/api/radio/like?alg=itembased" +
    "&trackId=" +
    encodeURIComponent(songId) +
    "&like=" +
    action +
    "&time=25" +
    "&csrf_token=" +
    encodeURIComponent(csrf);

  const resp = await neteaseGet(url);

  if (resp?.code === 200) {
    return like
      ? `Liked song ${songId}`
      : `Unliked song ${songId}`;
  }

  return (
    "Failed: " +
    (resp?.message || resp?.error || "unknown")
  );
}

async function dailyRecommend() {
  const csrf = csrfToken();

  const url =
    "https://music.163.com/api/v3/discovery/recommend/songs?csrf_token=" +
    encodeURIComponent(csrf);

  const resp = await neteaseRequest(url, "{}");

  const songs =
    resp?.data?.dailySongs || [];

  if (!songs.length) {
    return "Could not fetch daily recommendations.";
  }

  const lines = ["Today's recommendations:"];

  songs.slice(0, 30).forEach((song, index) => {
    const artist = (
      song.ar ||
      song.artists ||
      []
    )
      .map((a) => a.name || "")
      .join(", ");

    let line =
      `${index + 1}. ${song.name || ""} - ${artist} (ID:${song.id || ""})`;

    if (song.reason) {
      line += ` [${song.reason}]`;
    }

    lines.push(line);
  });

  return lines.join("\n");
}

const TOOLS = [
  {
    name: "play_music",
    description:
      "Search and play a song from NetEase Cloud Music.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
        note: {
          type: "string",
          description: "Optional note",
        },
      },
      required: ["query"],
    },
  },

  {
    name: "create_playlist",
    description:
      "Create a new playlist in NetEase account.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Playlist name",
        },
        description: {
          type: "string",
          description: "Description",
        },
        privacy: {
          type: "integer",
          description: "0=public, 10=private",
        },
      },
      required: ["name"],
    },
  },

  {
    name: "update_playlist_description",
    description:
      "Update a playlist's description.",
    inputSchema: {
      type: "object",
      properties: {
        playlist_id: {
          type: "integer",
          description: "Playlist ID",
        },
        description: {
          type: "string",
          description: "New description text",
        },
      },
      required: ["playlist_id", "description"],
    },
  },

  {
    name: "add_to_playlist",
    description:
      "Add song(s) to a playlist.",
    inputSchema: {
      type: "object",
      properties: {
        playlist_id: {
          type: "integer",
          description: "Playlist ID",
        },
        song_ids: {
          type: "string",
          description:
            "Song ID(s), comma-separated",
        },
      },
      required: ["playlist_id", "song_ids"],
    },
  },

  {
    name: "remove_from_playlist",
    description:
      "Remove song(s) from a playlist.",
    inputSchema: {
      type: "object",
      properties: {
        playlist_id: {
          type: "integer",
          description: "Playlist ID",
        },
        song_ids: {
          type: "string",
          description:
            "Song ID(s) to remove",
        },
      },
      required: ["playlist_id", "song_ids"],
    },
  },

  {
    name: "list_my_playlists",
    description:
      "List all playlists of the logged-in user.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  {
    name: "get_playlist_songs",
    description:
      "Get all songs in a playlist.",
    inputSchema: {
      type: "object",
      properties: {
        playlist_id: {
          type: "integer",
          description: "Playlist ID",
        },
      },
      required: ["playlist_id"],
    },
  },

  {
    name: "get_play_history",
    description:
      "Get recent play history.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description:
            "Number of records, default 30",
        },
        all_time: {
          type: "boolean",
          description:
            "true=all time, false=this week",
        },
      },
    },
  },

  {
    name: "like_song",
    description:
      "Like or unlike a song.",
    inputSchema: {
      type: "object",
      properties: {
        song_id: {
          type: "integer",
          description: "Song ID",
        },
        like: {
          type: "boolean",
          description:
            "true=like, false=unlike",
        },
      },
      required: ["song_id"],
    },
  },

  {
    name: "daily_recommend",
    description:
      "Get today's personalized recommendations.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

async function handleJsonRpc(body) {
  const method = body?.method || "";
  const id = body?.id;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "netease-music-mcp",
          version: "2.0.0-netlify",
        },
      },
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: TOOLS,
      },
    };
  }

  if (method === "tools/call") {
    const name =
      body?.params?.name || "";

    const args =
      body?.params?.arguments || {};

    let text;

    try {
      switch (name) {
        case "play_music":
          text = await playMusic(
            args.query || "",
            args.note
          );
          break;

        case "create_playlist":
          text = await createPlaylist(
            args.name || "",
            args.description || "",
            args.privacy ?? 0
          );
          break;

        case "update_playlist_description":
          text =
            await updatePlaylistDescription(
              args.playlist_id,
              args.description || ""
            );
          break;

        case "add_to_playlist":
          text = await addToPlaylist(
            args.playlist_id,
            args.song_ids || ""
          );
          break;

        case "remove_from_playlist":
          text =
            await removeFromPlaylist(
              args.playlist_id,
              args.song_ids || ""
            );
          break;

        case "list_my_playlists":
          text =
            await listMyPlaylists();
          break;

        case "get_playlist_songs":
          text =
            await getPlaylistSongs(
              args.playlist_id
            );
          break;

        case "get_play_history":
          text =
            await getPlayHistory(
              args.limit ?? 30,
              args.all_time ?? false
            );
          break;

        case "like_song":
          text = await likeSong(
            args.song_id,
            args.like ?? true
          );
          break;

        case "daily_recommend":
          text =
            await dailyRecommend();
          break;

        default:
          text = "Unknown tool: " + name;
      }
    } catch (error) {
      text =
        "Error: " + String(error);
    }

    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
    };
  }

  if (method.startsWith("notifications/")) {
    return null;
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message:
        "Unknown method: " + method,
    },
  };
}

export default async function handler(req) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods":
      "GET,POST,OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        status: "ok",
        name: "netease-music-mcp",
        tools: TOOLS.length,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Method Not Allowed",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  try {
    const body = await req.json();

    if (
      body?.method?.startsWith(
        "notifications/"
      ) ||
      body?.id === undefined ||
      body?.id === null
    ) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const result =
      await handleJsonRpc(body);

    if (result === null) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
          "Mcp-Session-Id":
            "netlify-session",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32700,
          message:
            "Parse error: " +
            String(error),
        },
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }
}
