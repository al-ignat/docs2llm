# Homebrew formula for docs2llm
# Install: brew install al-ignat/tap/docs2llm
#
# After a new release, update:
#   1. version
#   2. url versions in both architecture blocks
#   3. sha256 values (from checksums.txt in the GitHub Release)

class Docs2llm < Formula
  desc "Turn documents into LLM-ready Markdown"
  homepage "https://github.com/al-ignat/docs2llm"
  license "MIT"
  version "0.1.0"

  on_macos do
    on_arm do
      url "https://github.com/al-ignat/docs2llm/releases/download/v0.1.0/docs2llm-darwin-arm64.tar.gz"
      sha256 "269ca48a1b99ce7c299b67bb8b66e90ee60785ae2421bcc6eeb2959ab03feca3"
    end
  end

  def install
    bin.install "docs2llm"
    lib.install "libpdfium.dylib"
  end

  def post_install
    # Symlink libpdfium next to the binary so Kreuzberg can find it
    ln_sf lib/"libpdfium.dylib", bin/"libpdfium.dylib"
  end

  test do
    assert_match "docs2llm", shell_output("#{bin}/docs2llm --version")
  end
end
