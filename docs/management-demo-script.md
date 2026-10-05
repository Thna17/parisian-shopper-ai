# Management Demo Script: Parisian Shopper AI Telegram Content System

**Duration:** 5–7 Minutes  
**Audience:** Executive Leadership, Head of Marketing, Product Management, Operations  
**Presenter:** Engineering Lead / Product Manager  
**Environment:** Staging / Demo Environment (`DEMO_MODE=true`)  

---

## 1. Executive Briefing (30 Seconds)

> *"Good morning everyone. Today we are demonstrating the Parisian Shopper AI Content System.*  
>  
> *Our goal is to automate the time-consuming process of drafting bilingual marketing copy for our luxury catalogue in Telegram and Facebook, while ensuring 100% factual accuracy and human review.*  
>  
> *Key takeaway: This system is NOT an unmonitored auto-poster. The AI is a co-pilot that drafts and fact-checks; human reviewers maintain complete editorial authority. Every post must be approved by a designated reviewer before reaching the terminal approved state.*  
>  
> *Notice that all messages on screen have a clear `[DEMO]` tag to ensure complete transparency."*

---

## 2. Scene 1: The Golden Path — Creation, Revision & Approval (3 Minutes)

### Step 1: Initiating Content Creation
- **Action:** Open Telegram chat with `@ParisianShopperDemoBot`.
- **Command:** Type `/create FIC-PERF-001` (Moonlit River Eau de Parfum, \$38 USD).
- **Say:** *"We initiate draft creation using a verified product SKU. The bot immediately returns the verified catalogue card with name, price, stock, and fragrance notes."*
- **Action:**
  - Click **Product Spotlight**.
  - Click **Bilingual (Khmer + English)**.
  - Click **Telegram**.
- **Bot Response:** Shows `Generating content for Moonlit River Eau de Parfum… Job #...`.

### Step 2: Reviewing the First Draft (V1)
- **Say:** *"Within 2 seconds, our background workers have generated the copy and run our deterministic fact-checker. Notice the green banner: `✅ Facts checked — no blocking issues`.*  
- **Point out:**
  - Headline, Khmer caption, English caption, Call to Action, and hashtags.
  - Interactive action buttons: **✏️ Request Edit**, **🔄 Regenerate**, **✅ Approve**, **View Source**, **View Validation**.

### Step 3: Human Feedback & Revision (Creating V2)
- **Action:** Click **✏️ Request Edit**.
- **Bot Response:** Prompts for instructions.
- **Action:** Type: *"Make the English headline more poetic and emphasize the jasmine notes."*
- **Say:** *"As a reviewer, I can give conversational feedback just like working with a junior copywriter."*
- **Bot Response:** Worker processes revision and delivers **DRAFT — V2**.
- **Point out:** Version number has incremented to V2; the copy now emphasizes jasmine; fact-check is re-verified.

### Step 4: Two-Step Approval Confirmation
- **Action:** Click **✅ Approve**.
- **Bot Response:** Confirmation dialog appears:  
  `⚠️ Confirm Approval: Are you sure you want to approve version V2? Once approved, this job is marked as APPROVED (final).`
- **Action:** Click **✅ Confirm Approve**.
- **Bot Response:** `✅ Version V2 Approved. Content job is now APPROVED.`
- **Say:** *"Notice the two-step safety check to prevent accidental clicks. Once approved, the job reaches terminal APPROVED status."*

---

## 3. Scene 2: Safety & Anti-Hallucination Guardrails (2 Minutes)

### Step 1: The Problem — AI Hallucinations
- **Say:** *"The biggest risk with generative AI in retail is price hallucinations—a model offering a \$38 fragrance for \$10, causing customer disputes and margin loss. Watch how our deterministic validation engine prevents this."*

### Step 2: Negative Path Simulation
- **Action:** Trigger a demo draft with an unverified price (\$999.00 vs \$38.00 catalogue).
- **Bot Response:** Delivers draft with a bold red banner:  
  `❌ BLOCKED — factual issues detected; this draft cannot be approved.`
- **Point out:**
  1. **The Approve button is completely absent.** The reviewer is physically prevented from approving bad copy.
  2. Click **View Validation**: Shows the exact finding: `BLOCKING - PRICE_MISMATCH: Claimed price does not match catalogue price ($38.00)`.
- **Say:** *"Even if an AI model hallucinates or an editor attempts a bypass, the server-side security layer blocks approval. Bad data cannot slip through."*

---

## 4. Scene 3: Audit Trail & Operational Transparency (1 Minute)

### Step 1: Inspecting Status & History
- **Action:** Type `/status`.
- **Say:** *"Any team member can instantly check the pipeline status of recent jobs."*
- **Action:** Type `/history FIC-PERF-001`.
- **Say:** *"We maintain an immutable history of every version, who edited it, what was changed, and who gave final approval."*

---

## 5. Summary & Next Steps (30 Seconds)

> *"In summary:*  
> *1. Speed: Content drafted and verified in seconds.*  
> *2. Accuracy: Hallucinations and price errors are automatically blocked.*  
> *3. Control: Human reviewers maintain strict sign-off authority.*  
>  
> *We are ready to begin the internal 5-user pilot next week. We welcome your questions."*
