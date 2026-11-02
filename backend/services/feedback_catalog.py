"""The features users are asked about, and the choices offered for each.

Add a feature by adding an entry here; the popup, validation and the admin
view all read from this list.
"""

from ..schemas.feedback import FeedbackOption, FeedbackPrompt


def _prompt(
    feature: str,
    title: str,
    question: str,
    choice_question: str,
    options: dict[str, str],
) -> FeedbackPrompt:
    return FeedbackPrompt(
        feature=feature,
        title=title,
        question=question,
        choice_question=choice_question,
        options=[
            FeedbackOption(value=value, label=label)
            for value, label in options.items()
        ],
    )


CATALOG: tuple[FeedbackPrompt, ...] = (
    _prompt(
        "meeting_ai",
        "Meeting notes AI",
        "How well does the AI turn meeting notes into a quotation?",
        "What should improve first?",
        {
            "accuracy": "Accuracy of the items",
            "speed": "Speed",
            "prices": "Prices and materials",
            "editing": "Easier editing afterwards",
        },
    ),
    _prompt(
        "designs",
        "Designs and hotspots",
        "How useful are designs with hotspots?",
        "What would help most?",
        {
            "upload": "Faster uploads",
            "hotspots": "Easier hotspot placing",
            "link_items": "Linking hotspots to quotation items",
            "viewing": "Better viewing for customers",
        },
    ),
    _prompt(
        "quotation",
        "Quotations",
        "How do you find building quotations?",
        "What would help most?",
        {
            "layout": "A clearer layout",
            "export": "Better export (Excel or print)",
            "versions": "Easier version handling",
            "margins": "Simpler margins",
        },
    ),
    _prompt(
        "sharing",
        "Sharing with customers",
        "How well do shared links work with your customers?",
        "What would help most?",
        {
            "replies": "Clearer customer replies",
            "branding": "More branding",
            "expiry": "More control over expiry",
            "tracking": "Better view tracking",
        },
    ),
    _prompt(
        "portfolio",
        "Portfolio",
        "How useful is the portfolio for showing your work?",
        "What would help most?",
        {
            "ordering": "Easier ordering",
            "sharing": "A nicer public page",
            "filters": "Better filters",
            "upload": "Faster uploads",
        },
    ),
    _prompt(
        "materials",
        "Material library",
        "How useful is the material library?",
        "What would help most?",
        {
            "import": "Easier import of rates",
            "search": "Better search",
            "categories": "Better categories",
            "history": "Price history",
        },
    ),
    _prompt(
        "board",
        "Client board",
        "How well does the client board track your projects?",
        "What would help most?",
        {
            "phases": "Customisable phases",
            "filters": "Better filters",
            "reminders": "Reminders",
            "overview": "A clearer overview",
        },
    ),
    _prompt(
        "overall",
        "Overall",
        "Overall, how happy are you with reve8 Studio?",
        "What matters most to you?",
        {
            "speed": "Speed",
            "ease": "Ease of use",
            "ai": "AI quality",
            "reliability": "Reliability",
        },
    ),
)

BY_FEATURE: dict[str, FeedbackPrompt] = {p.feature: p for p in CATALOG}
