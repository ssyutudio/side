// Every AppleScript this helper can run, as fixed text. File names only ever
// arrive through `on run argv`, as separate osascript arguments. Nothing is
// built by joining text, so a file name can never become code.
//
// None of these may save, overwrite, export, close or quit. The test suite
// fails if one tries, or if one reaches for a shell or for keystrokes.
//
// Jump scripts receive (full file name, name without extension) and first check
// that this document is the one in front. "not_ready" and "not_front" mean try
// again shortly, while the app finishes opening it. "ok" means it happened.
//
// Written against each app's documented dictionary. Scripts for apps that were
// not on the build machine are marked verified: false in adapters.mjs.

import { run } from "./exec.mjs";

const OSASCRIPT = "/usr/bin/osascript";

export const SCRIPTS = Object.freeze({
  // Excel: the used range can include empty cells that only have formatting, so
  // look up from below it for the lowest filled cell, then the rightmost in that row.
  excel_jump_last_cell: `on run argv
	set fullName to item 1 of argv
	set baseName to item 2 of argv
	with timeout of 4 seconds
		tell application id "com.microsoft.Excel"
			if (count of workbooks) is 0 then return "not_ready"
			set currentName to name of active workbook
			if currentName is not fullName and currentName is not baseName then return "not_front"
			activate
			set ws to active sheet
			set ur to used range of ws
			set r1 to first row index of ur
			set c1 to first column index of ur
			set rN to r1 + (count of rows of ur) - 1
			set cN to c1 + (count of columns of ur) - 1
			set targetRow to rN
			set targetCol to cN
			try
				set bestRow to 0
				set stopCol to cN
				if stopCol > c1 + 39 then set stopCol to c1 + 39
				set probeRow to rN + 1
				if probeRow > 1048576 then set probeRow to 1048576
				repeat with c from c1 to stopCol
					set hit to get end (cell c of row probeRow of ws) direction toward the top
					set hitValue to value of hit
					if hitValue is not "" and hitValue is not missing value then
						set hitRow to first row index of hit
						if not (hitRow < bestRow) then
							set bestRow to hitRow
							set targetRow to hitRow
							set targetCol to c
						end if
					end if
				end repeat
			end try
			select (cell targetCol of row targetRow of ws)
		end tell
	end timeout
	return "ok"
end run`,

  excel_front: `on run argv
	with timeout of 2 seconds
		if application id "com.microsoft.Excel" is running then
			tell application id "com.microsoft.Excel"
				if (count of workbooks) is 0 then return ""
				return name of active workbook
			end tell
		end if
	end timeout
	return ""
end run`,

  word_jump_end: `on run argv
	set fullName to item 1 of argv
	set baseName to item 2 of argv
	with timeout of 4 seconds
		tell application id "com.microsoft.Word"
			if (count of documents) is 0 then return "not_ready"
			set currentName to name of active document
			if currentName is not fullName and currentName is not baseName then return "not_front"
			activate
			set d to active document
			set endPos to end of content of text object of d
			if endPos > 0 then set endPos to endPos - 1
			select (create range d start endPos end endPos)
		end tell
	end timeout
	return "ok"
end run`,

  word_front: `on run argv
	with timeout of 2 seconds
		if application id "com.microsoft.Word" is running then
			tell application id "com.microsoft.Word"
				if (count of documents) is 0 then return ""
				return name of active document
			end tell
		end if
	end timeout
	return ""
end run`,

  powerpoint_go_last_slide: `on run argv
	set fullName to item 1 of argv
	set baseName to item 2 of argv
	with timeout of 4 seconds
		tell application id "com.microsoft.Powerpoint"
			if (count of presentations) is 0 then return "not_ready"
			set currentName to name of active presentation
			if currentName is not fullName and currentName is not baseName then return "not_front"
			activate
			set p to active presentation
			set lastIndex to count of slides of p
			if lastIndex is 0 then return "not_ready"
			go to slide (view of document window 1) number lastIndex
		end tell
	end timeout
	return "ok"
end run`,

  // Runs the show with the settings as they are, then moves within the show.
  // Changing the show's start slide would change the presentation itself.
  powerpoint_play_last_slide: `on run argv
	set fullName to item 1 of argv
	set baseName to item 2 of argv
	with timeout of 4 seconds
		tell application id "com.microsoft.Powerpoint"
			if (count of presentations) is 0 then return "not_ready"
			set currentName to name of active presentation
			if currentName is not fullName and currentName is not baseName then return "not_front"
			activate
			set p to active presentation
			if (count of slides of p) is 0 then return "not_ready"
			run slide show (slide show settings of p)
			go to last slide (slide show view of slide show window 1)
		end tell
	end timeout
	return "ok"
end run`,

  powerpoint_front: `on run argv
	with timeout of 2 seconds
		if application id "com.microsoft.Powerpoint" is running then
			tell application id "com.microsoft.Powerpoint"
				if (count of presentations) is 0 then return ""
				return name of active presentation
			end tell
		end if
	end timeout
	return ""
end run`,

  // Numbers: tables often have empty rows at the bottom, so walk up to the last filled one.
  numbers_jump_last_cell: `on run argv
	set fullName to item 1 of argv
	set baseName to item 2 of argv
	with timeout of 4 seconds
		tell application id "com.apple.iWork.Numbers"
			if (count of documents) is 0 then return "not_ready"
			set d to front document
			set currentName to name of d
			if currentName is not fullName and currentName is not baseName then return "not_front"
			activate
			set t to table 1 of active sheet of d
			set lastRow to row count of t
			set floorRow to lastRow - 300
			if floorRow < 1 then set floorRow to 1
			set targetRow to lastRow
			set targetCol to 1
			set found to false
			repeat with r from lastRow to floorRow by -1
				set rowValues to value of cells of row r of t
				repeat with c from (count of rowValues) to 1 by -1
					if item c of rowValues is not missing value then
						set targetRow to r
						set targetCol to c
						set found to true
						exit repeat
					end if
				end repeat
				if found then exit repeat
			end repeat
			set cellName to name of cell targetCol of row targetRow of t
			set selection range of t to range (cellName & ":" & cellName) of t
		end tell
	end timeout
	return "ok"
end run`,

  numbers_front: `on run argv
	with timeout of 2 seconds
		if application id "com.apple.iWork.Numbers" is running then
			tell application id "com.apple.iWork.Numbers"
				if (count of documents) is 0 then return ""
				return name of front document
			end tell
		end if
	end timeout
	return ""
end run`,

  pages_front: `on run argv
	with timeout of 2 seconds
		if application id "com.apple.iWork.Pages" is running then
			tell application id "com.apple.iWork.Pages"
				if (count of documents) is 0 then return ""
				return name of front document
			end tell
		end if
	end timeout
	return ""
end run`,

  keynote_go_last_slide: `on run argv
	set fullName to item 1 of argv
	set baseName to item 2 of argv
	with timeout of 4 seconds
		tell application id "com.apple.iWork.Keynote"
			if (count of documents) is 0 then return "not_ready"
			set d to front document
			set currentName to name of d
			if currentName is not fullName and currentName is not baseName then return "not_front"
			activate
			set current slide of d to last slide of d
		end tell
	end timeout
	return "ok"
end run`,

  keynote_play_last_slide: `on run argv
	set fullName to item 1 of argv
	set baseName to item 2 of argv
	with timeout of 4 seconds
		tell application id "com.apple.iWork.Keynote"
			if (count of documents) is 0 then return "not_ready"
			set d to front document
			set currentName to name of d
			if currentName is not fullName and currentName is not baseName then return "not_front"
			activate
			start d from last slide of d
		end tell
	end timeout
	return "ok"
end run`,

  keynote_front: `on run argv
	with timeout of 2 seconds
		if application id "com.apple.iWork.Keynote" is running then
			tell application id "com.apple.iWork.Keynote"
				if (count of documents) is 0 then return ""
				return name of front document
			end tell
		end if
	end timeout
	return ""
end run`,

  photoshop_front: `on run argv
	with timeout of 2 seconds
		if application id "com.adobe.Photoshop" is running then
			tell application id "com.adobe.Photoshop"
				if (count of documents) is 0 then return ""
				return name of current document
			end tell
		end if
	end timeout
	return ""
end run`,

  quicktime_play_last_ten: `on run argv
	set fullName to item 1 of argv
	set baseName to item 2 of argv
	with timeout of 4 seconds
		tell application id "com.apple.QuickTimePlayerX"
			set theDoc to missing value
			repeat with d in documents
				set currentName to name of d
				if currentName is fullName or currentName is baseName then
					set theDoc to contents of d
					exit repeat
				end if
			end repeat
			if theDoc is missing value then return "not_front"
			activate
			set total to duration of theDoc
			if total is 0 then return "not_ready"
			set startAt to total - 10
			if startAt < 0 then set startAt to 0
			set current time of theDoc to startAt
			play theDoc
		end tell
	end timeout
	return "ok"
end run`,

  quicktime_front: `on run argv
	with timeout of 2 seconds
		if application id "com.apple.QuickTimePlayerX" is running then
			tell application id "com.apple.QuickTimePlayerX"
				if (count of documents) is 0 then return ""
				return name of front document
			end tell
		end if
	end timeout
	return ""
end run`,
});

/** Runs a script from the fixed list. Refuses any other name; there is no way to pass script text. */
export function runScript(name, argv = [], { timeoutMs = 5000 } = {}) {
  if (!Object.hasOwn(SCRIPTS, name)) throw new Error("unknown script");
  // "--" so a name that begins with a dash stays an argument.
  return run(OSASCRIPT, ["-e", SCRIPTS[name], "--", ...argv.map(String)], { timeoutMs });
}

/** The AppleScript error number in osascript's stderr, or null. */
export function appleScriptErrorNumber(stderr) {
  const match = /\((-?\d+)\)\s*$/.exec(String(stderr).trim());
  return match ? Number(match[1]) : null;
}
