"""Narration texts, voices, and voiceover start times for every video."""

# video -> (voice, rate, [(segment, start_sec, text)])
VIDEOS = {
    "main": ("en-US-AndrewNeural", "+4%", [
        ("s1", 0.8,
         "If you run an interior design studio, you know the pain. Requirements scattered "
         "across calls and chats, and quotations that never stop changing. "
         "Meet the Reve8 Designer Portal."),
        ("s2", 12.4,
         "Your dashboard shows every client by phase. Discussion, design, quotation, "
         "implementation, completed. One glance, and you know where every project stands."),
        ("s3", 23.4,
         "Each client gets one home. Phase, budget, contacts, and quick links to their "
         "checkpoints, designs, and quotation."),
        ("s4", 33.6,
         "After every meeting, paste your notes, or upload the audio. The AI extracts the "
         "work items: rooms, sizes, units and rates. Review, verify, and add to the "
         "quotation in one click. That's hours of retyping, gone."),
        ("s5", 60.4,
         "The quotation organizes itself room by room, with initial quote, negotiated offer, "
         "and the difference calculated live. Collapse everything for an overview, or dive "
         "into any room."),
        ("s6", 78.4,
         "When plans change, What Changed shows exactly what was added, removed or modified "
         "since any checkpoint. And clicking a change jumps right to it."),
        ("s9", 93.4,
         "Prefer light mode? One click. When everyone agrees, export a clean Excel, or "
         "approve right here."),
        ("s7", 106.4,
         "Keep your material rates and margins in one catalogue. Upload Excel, extract with "
         "AI, or add manually. Your quotations always price from current rates."),
        ("s8", 120.4,
         "And the tables adapt to you. Reorder columns, or add custom fields. They appear "
         "across every quotation."),
        ("s10", 133.4,
         "Reve8 Designer Portal. From conversation to quotation, in minutes. "
         "Less paperwork. More design."),
    ]),
    "mobile": ("en-GB-RyanNeural", "+4%", [
        ("s1", 0.6,
         "This is Reve8, the portal that runs your interior design studio, right from "
         "your phone."),
        ("s2", 7.4,
         "Track every client by phase, and keep everything about them in one place."),
        ("s3", 14.4,
         "After each meeting, paste your notes. The AI turns them into quotation "
         "line items. Verify, add, done."),
        ("s4", 27.4,
         "Your quotation stays organized room by room, with totals always current."),
        ("s5", 34.4,
         "And when the client changes their mind, see exactly what changed, instantly."),
        ("s6", 41.4,
         "Reve8 Designer Portal. Get your evenings back."),
    ]),
    "reel1": ("en-IN-NeerjaNeural", "+6%", [
        ("s1", 0.5, "Still typing out quotations after every client meeting? Stop."),
        ("s2", 6.4,
         "Paste your meeting notes, or just upload the voice recording. The AI pulls out "
         "every work item. Rooms, sizes, rates."),
        ("s3", 17.6,
         "Verify, and push straight into the quotation. One click. Hours of typing, gone."),
        ("s4", 25.8, "Reve8 Designer Portal. Less paperwork. More design."),
    ]),
    "reel2": ("en-US-AvaNeural", "+4%", [
        ("s1", 0.5,
         "Your client changed their mind. Again. Which version of the quotation is real now?"),
        ("s2", 7.4,
         "Reve8 tracks every checkpoint, and shows you exactly what was added, removed, "
         "or changed."),
        ("s3", 15.4, "Click it. Jump to it. Done. Total transparency, for you and your client."),
        ("s4", 23.4, "Reve8 Designer Portal. Never lose track again."),
    ]),
    "reel3": ("en-IN-PrabhatNeural", "+4%", [
        ("s1", 0.5,
         "Interior designers, how much of your week goes into paperwork?"),
        ("s2", 5.9,
         "Meetings in one app. Notes in another. Quotations in spreadsheets. "
         "Reve8 brings it all together."),
        ("s3", 16.4,
         "Clients, designs, checkpoints and quotations, with AI doing the heavy lifting."),
        ("s4", 23.4, "Track every phase. Quote in minutes. Win the project."),
        ("s5", 30.0, "Reve8 Designer Portal. Get your evenings back."),
    ]),
}

# total duration per video (seconds)
TOTALS = {"main": 146.0, "mobile": 46.0, "reel1": 33.0, "reel2": 29.0, "reel3": 36.5}
