"""Reviewed PR #39 shortlist, not a quote or proof of new-business availability."""
VERSION = "lincoln-2026-10-04-v1"
STATES = set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split())


def policy(id, name, category, minimum, maximum, ages, source, points, caveat, excluded=(), terms=None):
    return dict(id=id, name=name, category=category, minimum=minimum, maximum=maximum,
                ages=ages, source=source, points=points, caveat=caveat,
                excluded=list(excluded), terms=terms)


POLICIES = [
    policy("termaccel", "Lincoln TermAccel Level Term", "term", 100000, 2500000, [18, 60],
           "https://www.lincolnfinancial.com/public/individuals/products/lifeinsurance/termlife/lincolntermaccellevelterm",
           ["Level premiums for the selected term; no cash value.",
            "Electronic application; some qualified applicants may avoid lab work.",
            "Conversion to qualifying permanent policies before the term ends or age 70, whichever comes first."],
           "Approval is underwritten. After the level period, coverage reduces and premiums can increase.",
           ["NY"], {10: [60, 60], 15: [60, 60], 20: [60, 60], 30: [55, 50]}),
    policy("lifeelements", "Lincoln LifeElements Level Term", "term", 250000, None, [18, 80],
           "https://www.lincolnfinancial.com/public/individuals/products/lifeinsurance/termlife/lincolnnlifeelementslevelterm",
           ["Level premiums for 10, 15, 20 or 30 years; no cash value.",
            "Coverage maximum depends on individual underwriting.",
            "Conversion to qualifying permanent policies before the term ends or age 70, whichever comes first."],
           "Approval is underwritten. Coverage reduces after the level period and renewal premiums increase.",
           ["NY"], {10: [80, 80], 15: [75, 70], 20: [70, 65], 30: [55, 50]}),
    policy("wealthprotector", "Lincoln WealthProtector IUL", "permanent", 100000, None, [0, 80],
           "https://visit.lfg.com/PTR-FACT-FST001",
           ["Protection-focused indexed universal life with flexible premiums.",
            "15-year base no-lapse protection requires sufficient premiums.",
            "Optional extended protection has its own funding and transaction conditions."],
           "Lifelong protection needs adequate funding. Index growth is not guaranteed; charges, loans and withdrawals can reduce value and protection.",
           ["NY", "CA"]),
    policy("wealthaccelerate", "Lincoln WealthAccelerate IUL", "permanent", 100000, 1500000, [20, 55],
           "https://thecasongroup.com/wp-content/uploads/2023/03/WealthAccelerate-IUL-Client-Fact-Sheet.pdf",
           ["Streamlined electronic underwriting for qualifying applicants.",
            "Indexed and fixed-account cash-value choices.",
            "10-year no-lapse guarantee requires sufficient funding."],
           "The reviewed client sheet is an older version. Lifelong protection needs adequate funding after the guarantee; loans and withdrawals can cause lapse.",
           ["NY", "MA"]),
    policy("wealthbuilder", "Lincoln WealthBuilder IUL", "permanent", 100000, None, [0, 80],
           "https://visit.lfg.com/WB-FACT-FST001",
           ["Accumulation-focused indexed universal life with flexible premiums.",
            "Indexed-account choices plus a fixed account; growth is not guaranteed.",
            "10-year conditional no-lapse guarantee, with ongoing funding needed afterward."],
           "Insurance and administrative charges continue even when index growth disappoints. Loans and withdrawals reduce benefits and may cause lapse.",
           ["NY"]),
]


# Answers underwriting weighs on price class and medical review, with the value that raises them.
WEIGHED = (("tobacco", "yes", "tobacco use"), ("health", "fair", "health"))
STREAMLINED = ("termaccel", "wealthaccelerate")


def eligible(age, preferences, gap):
    """Exclude known conflicts; qualify unknowns and minimum mismatches explicitly."""
    found = []
    state, tobacco = preferences["state"], preferences["tobacco"]
    weighed = [label for name, value, label in WEIGHED if preferences.get(name) == value]
    for entry in POLICIES:
        if entry["id"] == "wealthbuilder" and preferences["cashValue"] != "yes":
            continue
        if state in entry["excluded"] or (entry["maximum"] is not None and gap > entry["maximum"]):
            continue
        low, high = entry["ages"]
        if entry["category"] == "permanent" and tobacco == "yes":
            low = max(low, 15)
        if age is not None and not low <= age <= high:
            continue
        notes = ["Subject to underwriting, current state availability and policy illustration."]
        if state is None:
            notes.append("State was not provided; availability must be confirmed.")
        if age is None:
            notes.append("Age was not provided; issue-age eligibility must be confirmed.")
        if tobacco is None:
            notes.append("Tobacco status is unknown; eligibility and premiums may differ.")
        if weighed:
            notes.append(f"Underwriting will weigh your {' and '.join(weighed)}; that can mean higher premiums or more medical review.")
        if entry["id"] in STREAMLINED and preferences.get("health") == "fair":
            notes.append("With a serious health condition, the streamlined application may not apply; expect full underwriting.")
        if entry["category"] == "permanent":
            notes.append("Published ages use age nearest birthday and underwriting class; exact eligibility needs confirmation.")
        if gap < entry["minimum"]:
            notes.append(f"Your gap is below this product's ${entry['minimum']:,} published minimum. The amount shown has not been increased.")
        terms = []
        if entry["terms"]:
            for years, limits in entry["terms"].items():
                limit = limits[0] if tobacco == "no" else limits[1]
                if age is None or age <= limit:
                    terms.append(years)
            if not terms:
                continue
        found.append({**entry, "eligibleTerms": terms, "qualifications": notes})
    return found
